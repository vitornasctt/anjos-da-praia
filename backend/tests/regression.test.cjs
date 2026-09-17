const { test, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

// Never load or connect to the configured database during these tests.
process.env.JWT_SECRET = 'local-regression-test-secret-not-for-production';
process.env.DATABASE_URL = 'postgresql://test:test@127.0.0.1:1/test';
process.env.DIRECT_URL = process.env.DATABASE_URL;
process.env.NODE_ENV = 'test';
const jwt = require('jsonwebtoken');
const { Prisma } = require('@prisma/client');
const forbidden = async () => { throw new Error('Database access forbidden in regression tests'); };
const prisma = Object.fromEntries(['user', 'incident', 'tent', 'family', 'child', 'wristband', 'team', 'beach', 'auditLog', 'incidentStatusHistory'].map((model) => [model,
  Object.fromEntries(['findUnique', 'findFirst', 'findMany', 'count', 'create', 'update', 'updateMany'].map((method) => [method, forbidden])),
]));
prisma.$transaction = forbidden;
prisma.$disconnect = async () => {};
// Replace the application adapter before importing any routes. No real client is instantiated.
require.cache[require.resolve('../src/lib/prisma.ts')] = { exports: { prisma } };
const { app } = require('../src/app.ts');
const { serializable } = require('../src/lib/transaction.ts');
const { incidentExpired, purgeOldPersonalData, ANONYMIZED_LABEL } = require('../src/jobs/dataRetention.ts');
const { operationHour, operationDayStart } = require('../src/utils/time.ts');
const { createIncidentSchema } = require('../src/routes/public.routes.ts');
const { initIo, publishIncident } = require('../src/lib/io.ts');
const { io: connectSocket } = require('../../frontend/node_modules/socket.io-client');

let server, base, socketServer;
const user = { id: 'operator', name: 'Operador', active: true, role: 'ADMIN' };
const token = jwt.sign({ sub: user.id, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h' });
before(async () => {
  server = http.createServer(app);
  socketServer = initIo(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => socketServer.close(resolve)); await prisma.$disconnect(); });
beforeEach(() => {
  mock.method(prisma.user, 'findUnique', async () => ({ ...user }));
  mock.method(prisma, '$transaction', async () => { throw new Error('Unexpected transaction'); });
});
afterEach(() => mock.restoreAll());

async function request(path, body, options = {}) {
  const response = await fetch(base + '/api' + path, {
    method: options.method ?? (body ? 'POST' : 'GET'),
    headers: { 'Content-Type': 'application/json', ...(options.public ? {} : { Authorization: `Bearer ${token}` }), ...options.headers },
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(3000),
  });
  return { status: response.status, body: await response.json() };
}
function transaction(tx) {
  return mock.method(prisma, '$transaction', async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    return work(tx);
  });
}

test('desativacao bloqueia um JWT que ainda nao expirou', async () => {
  mock.method(prisma.user, 'findUnique', async () => ({ ...user, active: false }));
  assert.equal((await request('/incidents')).status, 401);
});
test('permissoes usam o perfil atual, nao o perfil antigo do JWT', async () => {
  mock.method(prisma.user, 'findUnique', async () => ({ ...user, role: 'EQUIPE_CAMPO' }));
  assert.equal((await request('/users')).status, 403);
});
test('erro assincrono de banco recebe JSON 500 sem requisicao pendurada', async () => {
  mock.method(prisma.user, 'findUnique', async () => { throw new Error('simulated outage'); });
  const result = await request('/incidents');
  assert.equal(result.status, 500);
  assert.equal(result.body.error, 'Erro interno do servidor.');
});
test('historico seleciona somente id e nome, nunca hash ou email', async () => {
  mock.method(prisma.incident, 'findUnique', async (query) => {
    const select = query.include.statusHistory.include.changedBy.select;
    assert.deepEqual(select, { id: true, name: true });
    const account = { id: 'admin', name: 'Admin', passwordHash: 'secret-hash', email: 'private@example.test' };
    return { id: 'incident', latitude: null, longitude: null, statusHistory: [{ changedBy: Object.fromEntries(Object.keys(select).map((key) => [key, account[key]])) }] };
  });
  const result = await request('/incidents/incident');
  assert.equal(result.status, 200);
  assert.ok(!JSON.stringify(result.body).includes('secret-hash'));
});
test('PATCH rejeita string false e ausencia do campo active', async () => {
  for (const resource of ['users', 'teams', 'tents']) {
    for (const body of [{ active: 'false' }, {}]) {
      assert.equal((await request(`/${resource}/other`, body, { method: 'PATCH' })).status, 400);
    }
  }
});
test('administrador nao pode desativar a propria conta', async () => {
  assert.equal((await request('/users/operator', { active: false }, { method: 'PATCH' })).status, 400);
});
test('CSRF continua obrigatorio para escritas usando cookie', async () => {
  const result = await request('/teams', { name: 'Equipe' }, { headers: { Cookie: `token=${token}; csrfToken=abc` } });
  assert.equal(result.status, 403);
});
test('coordenadas aceitam zero e exigem latitude e longitude juntas', () => {
  assert.equal(createIncidentSchema.safeParse({ printedNumber: '4821', latitude: 0, longitude: 0, locationAccuracy: 0 }).success, true);
  assert.equal(createIncidentSchema.safeParse({ printedNumber: '4821', latitude: -20 }).success, false);
  assert.equal(createIncidentSchema.safeParse({ printedNumber: '4821', longitude: -40, referencePoint: 'Posto' }).success, false);
  assert.equal(createIncidentSchema.safeParse({ printedNumber: '4821' }).success, false);
  assert.equal(createIncidentSchema.safeParse({ printedNumber: '4821', referencePoint: 'Posto 3' }).success, true);
});
test('reenvio reutiliza atendimento aberto mesmo apos dois minutos', async () => {
  transaction({
    wristband: { findUnique: async () => ({ id: 'band', status: 'ATIVA', childId: 'child' }) },
    incident: { findFirst: async (query) => {
      assert.equal(query.where.createdAt, undefined);
      return { id: 'old-open', status: 'EQUIPE_A_CAMINHO' };
    }, create: async () => { assert.fail('Must not create duplicate'); } },
  });
  const result = await request('/public/incidents', { printedNumber: '4821', referencePoint: 'Posto 3' }, { public: true });
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { id: 'old-open', status: 'EQUIPE_A_CAMINHO' });
});
test('consultas de acompanhamento nao gastam a cota de envio', async () => {
  mock.method(prisma.incident, 'findUnique', async () => ({ status: 'CRIANCA_LOCALIZADA' }));
  for (let i = 0; i < 25; i++) assert.equal((await request('/public/incidents/test/status', undefined, { public: true })).status, 200);
  transaction({
    wristband: { findUnique: async () => ({ id: 'band', status: 'ATIVA', childId: 'child' }) },
    incident: { findFirst: async () => null, create: async ({ data }) => {
      assert.equal(data.statusHistory.create.newStatus, 'CRIANCA_LOCALIZADA');
      return { id: 'new', status: data.status };
    } },
  });
  assert.equal((await request('/public/incidents', { printedNumber: '4821', latitude: 0, longitude: 0 }, { public: true })).status, 201);
});
test('lista inclui ocorrencias alem das primeiras 100 e consulta tendas uma vez', async () => {
  mock.method(prisma.incident, 'findMany', async (query) => {
    assert.equal(query.take, undefined);
    return Array.from({ length: 105 }, (_, id) => ({ id, latitude: 0, longitude: 0 }));
  });
  const tents = mock.method(prisma.tent, 'findMany', async () => []);
  const result = await request('/incidents');
  assert.equal(result.body.length, 105);
  assert.equal(tents.mock.callCount(), 1);
});
test('cancelamento grava data de encerramento e historico na mesma transacao', async () => {
  let history, audit;
  transaction({
    incident: { findUnique: async () => ({ id: 'i', status: 'CRIANCA_LOCALIZADA' }), update: async ({ where, data }) => {
      assert.equal(where.status, 'CRIANCA_LOCALIZADA');
      assert.ok(data.resolvedAt instanceof Date);
      return { id: 'i', ...data };
    } },
    incidentStatusHistory: { create: async ({ data }) => { history = data; } },
    auditLog: { create: async ({ data }) => { audit = data; } },
  });
  const result = await request('/incidents/i/status', { status: 'CANCELADA' }, { method: 'PATCH' });
  assert.equal(result.status, 200);
  assert.equal(history.newStatus, 'CANCELADA');
  assert.equal(audit.action, 'UPDATE_STATUS');
});
test('transicao desatualizada retorna conflito', async () => {
  transaction({ incident: { findUnique: async () => ({ id: 'i', status: 'CANCELADA' }) } });
  assert.equal((await request('/incidents/i/status', { status: 'EQUIPE_A_CAMINHO' }, { method: 'PATCH' })).status, 409);
});
test('cadastro verifica pulseira dentro da transacao e recusa vinculo existente', async () => {
  transaction({ wristband: { findUnique: async () => ({ id: 'b', status: 'ATIVA' }) } });
  assert.equal((await request('/families/intake', { responsibleName: 'Pessoa', responsiblePhone: '27999990000', childFirstName: 'Ana', printedNumber: '4821' })).status, 409);
});
test('conflito de serializacao tenta a transacao novamente', async () => {
  let attempts = 0;
  mock.method(prisma, '$transaction', async (work, options) => {
    assert.equal(options.isolationLevel, 'Serializable');
    if (++attempts === 1) throw new Prisma.PrismaClientKnownRequestError('retry', { code: 'P2034', clientVersion: '5' });
    return work({});
  });
  assert.equal(await serializable(async () => 'ok'), 'ok');
  assert.equal(attempts, 2);
});
test('retencao usa encerramento, preserva casos abertos e cancelamento recente', () => {
  const cutoff = new Date('2026-06-01T00:00:00Z');
  assert.equal(incidentExpired({ status: 'EQUIPE_A_CAMINHO', resolvedAt: null, statusHistory: [] }, cutoff), false);
  assert.equal(incidentExpired({ status: 'CANCELADA', resolvedAt: null, statusHistory: [{ newStatus: 'CANCELADA', changedAt: new Date('2026-09-01') }] }, cutoff), false);
  assert.equal(incidentExpired({ status: 'CANCELADA', resolvedAt: null, statusHistory: [] }, cutoff), false);
  assert.equal(incidentExpired({ status: 'CANCELADA', resolvedAt: null, statusHistory: [{ newStatus: 'CANCELADA', changedAt: new Date('2026-01-01') }] }, cutoff), true);
});
test('retencao preserva familia com outro caso aberto e expira cadastro antigo sem ocorrencias', async () => {
  const old = new Date('2020-01-01');
  const band = (id, incidents) => ({ id, createdAt: old, incidents });
  const child = (id, wristbands) => ({ id, createdAt: old, wristbands });
  const family = (id, children) => ({ id, createdAt: old, children, responsibleName: 'Nome', responsiblePhone: '27999990000' });
  const updated = [];
  transaction({
    family: { findMany: async () => [
      family('protected', [child('c1', [band('b1', [
        { status: 'REENCONTRO_REALIZADO', resolvedAt: old, statusHistory: [] },
        { status: 'EQUIPE_A_CAMINHO', resolvedAt: null, statusHistory: [] },
      ])])]),
      family('expired', [child('c2', [band('b2', [])])]),
    ], update: async ({ where, data }) => { updated.push(where.id); assert.equal(data.responsiblePhone, ANONYMIZED_LABEL); } },
    wristband: { updateMany: async ({ where, data }) => { assert.deepEqual(where.childId.in, ['c2']); assert.equal(data.status, 'ENCERRADA'); } },
    child: { updateMany: async () => ({ count: 1 }) }, auditLog: { create: async () => ({}) },
  });
  const result = await purgeOldPersonalData(90);
  assert.deepEqual(updated, ['expired']);
  assert.equal(result.anonymizedFamilies, 1);
  assert.equal(result.anonymizedChildren, 1);
});
test('prazo invalido nao executa expurgo', async () => {
  for (const days of [0, -1, NaN, 1.5, 3651]) await assert.rejects(purgeOldPersonalData(days), /Prazo/);
});
test('horarios e inicio do dia seguem Brasilia mesmo com servidor UTC', () => {
  const date = new Date('2026-09-14T02:30:00Z');
  assert.equal(operationHour(date), 23);
  assert.equal(operationDayStart(date).toISOString(), '2026-09-13T03:00:00.000Z');
});

function socketEvent(socket, event) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${event}`)), 2000);
    socket.once(event, (value) => { clearTimeout(timer); resolve(value); });
  });
}
test('Socket.IO recusa conexao sem sessao', async () => {
  const socket = connectSocket(base, { autoConnect: false, reconnection: false, transports: ['websocket'] });
  try {
    const rejected = socketEvent(socket, 'connect_error');
    socket.connect();
    assert.match((await rejected).message, /autenticado/);
  } finally { socket.disconnect(); }
});
test('Socket.IO entrega a equipe autenticada e bloqueia eventos apos desativacao', async () => {
  const socket = connectSocket(base, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const connected = socketEvent(socket, 'connect'); socket.connect(); await connected;
    const message = socketEvent(socket, 'incident:created');
    await publishIncident('incident:created', { id: 'test-event' });
    assert.deepEqual(await message, { id: 'test-event' });
    mock.method(prisma.user, 'findUnique', async () => ({ ...user, active: false }));
    const disconnected = socketEvent(socket, 'disconnect');
    let leaked = false;
    socket.on('incident:updated', () => { leaked = true; });
    await publishIncident('incident:updated', { id: 'private-event' });
    await disconnected;
    assert.equal(leaked, false);
  } finally { socket.disconnect(); }
});
