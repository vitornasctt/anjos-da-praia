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
const prisma = Object.fromEntries(['user', 'incident', 'tent', 'family', 'child', 'wristband', 'team', 'beach', 'auditLog', 'incidentStatusHistory', 'revokedSession'].map((model) => [model,
  Object.fromEntries(['findUnique', 'findFirst', 'findMany', 'count', 'create', 'update', 'updateMany', 'upsert', 'deleteMany'].map((method) => [method, forbidden])),
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
const token = jwt.sign({ sub: user.id, role: 'ADMIN' }, process.env.JWT_SECRET, { expiresIn: '1h', jwtid: 'test-session' });
before(async () => {
  server = http.createServer(app);
  socketServer = initIo(server);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(async () => { await new Promise((resolve) => socketServer.close(resolve)); await prisma.$disconnect(); });
beforeEach(() => {
  mock.method(prisma.user, 'findUnique', async () => ({ ...user }));
  mock.method(prisma.revokedSession, 'findUnique', async () => null);
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
test('ocorrencia sem GPS mas com praia informada traz a tenda de apoio da praia como referencia aproximada', async () => {
  mock.method(prisma.incident, 'findUnique', async () => ({
    id: 'incident', latitude: null, longitude: null, beachId: 'beach-1', statusHistory: [],
  }));
  mock.method(prisma.tent, 'findFirst', async (query) => {
    assert.deepEqual(query.where, { beachId: 'beach-1', active: true });
    return { id: 'tent-1', name: 'Tenda 1', latitude: -20.5, longitude: -40.5 };
  });
  const result = await request('/incidents/incident');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.beachTent, { id: 'tent-1', name: 'Tenda 1', latitude: -20.5, longitude: -40.5 });
});
test('ocorrencia com GPS proprio nao busca tenda da praia como aproximacao (ja tem localizacao exata)', async () => {
  mock.method(prisma.incident, 'findUnique', async () => ({
    id: 'incident', latitude: -20.1, longitude: -40.1, beachId: 'beach-1', statusHistory: [],
  }));
  mock.method(prisma.tent, 'findMany', async () => []);
  mock.method(prisma.tent, 'findFirst', async () => { throw new Error('nao deveria buscar tenda da praia quando ja ha GPS'); });
  const result = await request('/incidents/incident');
  assert.equal(result.status, 200);
  assert.equal(result.body.beachTent, null);
});
async function rawLogin() {
  const bcrypt = require('bcryptjs');
  const passwordHash = await bcrypt.hash('senha-correta', 4);
  mock.method(prisma.user, 'findUnique', async () => ({ id: 'operator', name: 'Operador', email: 'op@example.test', role: 'ADMIN', active: true, passwordHash }));
  return fetch(base + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'op@example.test', password: 'senha-correta' }),
  });
}
test('login grava cookie de sessao HttpOnly com validade, sem dados pessoais e sem cache', async () => {
  const { env } = require('../src/config/env.ts');
  const previous = env.nodeEnv;
  env.nodeEnv = 'production';
  try {
    const response = await rawLogin();
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookies = response.headers.getSetCookie();
    const session = cookies.find((c) => c.startsWith('token='));
    const csrf = cookies.find((c) => c.startsWith('csrfToken='));
    assert.match(session, /HttpOnly/i);
    assert.match(session, /Secure/i);
    assert.match(session, /SameSite=Lax/i);
    assert.match(session, /Path=\//);
    const maxAge = Number(/Max-Age=(\d+)/i.exec(session)[1]);
    assert.ok(maxAge > 8 * 3600 - 60 && maxAge <= 8 * 3600, 'validade do cookie alinhada ao JWT (8h)');
    assert.doesNotMatch(csrf, /HttpOnly/i);
    assert.match(csrf, /Secure/i);
    const payload = jwt.verify(/token=([^;]+)/.exec(session)[1], process.env.JWT_SECRET);
    assert.deepEqual(Object.keys(payload).sort(), ['exp', 'iat', 'jti', 'sub']);
    assert.match(payload.jti, /^[0-9a-f-]{36}$/);
  } finally { env.nodeEnv = previous; }
});
test('logout expira os dois cookies com os mesmos atributos da criacao', async () => {
  const { env } = require('../src/config/env.ts');
  const previous = env.nodeEnv;
  env.nodeEnv = 'production';
  try {
    const response = await fetch(base + '/api/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const cookies = response.headers.getSetCookie();
    for (const name of ['token', 'csrfToken']) {
      const cookie = cookies.find((c) => c.startsWith(name + '='));
      assert.match(cookie, /^[a-zA-Z]+=;/);
      assert.match(cookie, /Expires=Thu, 01 Jan 1970/);
      assert.match(cookie, /Path=\//);
      assert.match(cookie, /Secure/i);
      assert.match(cookie, /SameSite=Lax/i);
    }
    assert.match(cookies.find((c) => c.startsWith('token=')), /HttpOnly/i);
  } finally { env.nodeEnv = previous; }
});
test('cada login recebe um jti diferente', async () => {
  const jtis = [];
  for (let i = 0; i < 2; i++) {
    const cookie = (await rawLogin()).headers.getSetCookie().find((c) => c.startsWith('token='));
    jtis.push(jwt.verify(/token=([^;]+)/.exec(cookie)[1], process.env.JWT_SECRET).jti);
  }
  assert.notEqual(jtis[0], jtis[1]);
});
test('token sem jti nao autentica (nao poderia ser encerrado no logout)', async () => {
  const legacy = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: '1h' });
  const response = await fetch(base + '/api/incidents', { headers: { Authorization: `Bearer ${legacy}` } });
  assert.equal(response.status, 401);
});
test('sessao revogada no logout deixa de autenticar', async () => {
  mock.method(prisma.revokedSession, 'findUnique', async ({ where }) => { assert.equal(where.jti, 'test-session'); return { jti: 'test-session' }; });
  const result = await request('/incidents');
  assert.equal(result.status, 401);
  assert.match(result.body.error, /Sessao encerrada/);
});
async function logoutWith(cookieToken) {
  return fetch(base + '/api/auth/logout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: `token=${cookieToken}; csrfToken=abc`, 'X-CSRF-Token': 'abc' },
  });
}
test('logout registra o jti da sessao ate o token expirar e limpa os cookies', async () => {
  const calls = { upsert: [], deleteMany: [] };
  mock.method(prisma.revokedSession, 'upsert', async (args) => { calls.upsert.push(args); });
  mock.method(prisma.revokedSession, 'deleteMany', async (args) => { calls.deleteMany.push(args); });
  const exp = jwt.decode(token).exp;
  const response = await logoutWith(token);
  assert.equal(response.status, 200);
  assert.equal(calls.upsert.length, 1);
  assert.equal(calls.upsert[0].where.jti, 'test-session');
  assert.equal(calls.upsert[0].create.jti, 'test-session');
  assert.equal(calls.upsert[0].create.expiresAt.getTime(), exp * 1000);
  assert.ok(calls.deleteMany[0].where.expiresAt.lt instanceof Date, 'limpa sessoes revogadas ja expiradas');
  const cookies = response.headers.getSetCookie();
  assert.match(cookies.find((c) => c.startsWith('token=')), /Expires=Thu, 01 Jan 1970/);
});
test('logout com token invalido ou expirado nao revoga nada, mas limpa os cookies', async () => {
  const upsert = mock.method(prisma.revokedSession, 'upsert', async () => { throw new Error('nao deveria revogar'); });
  const expired = jwt.sign({ sub: user.id }, process.env.JWT_SECRET, { expiresIn: -10, jwtid: 'old' });
  for (const bad of ['lixo', expired]) {
    const response = await logoutWith(bad);
    assert.equal(response.status, 200);
    assert.match(response.headers.getSetCookie().find((c) => c.startsWith('token=')), /Expires=Thu, 01 Jan 1970/);
  }
  assert.equal(upsert.mock.callCount(), 0);
});
test('logout falha e NAO limpa os cookies se a revogacao nao for gravada', async () => {
  mock.method(prisma.revokedSession, 'upsert', async () => { throw new Error('banco indisponivel'); });
  const response = await logoutWith(token);
  assert.equal(response.status, 500);
  assert.equal(response.headers.getSetCookie().some((c) => c.startsWith('token=')), false);
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
  // O QR e generico: sem numero de pulseira nao ha alerta, e o token de QR individual nao e mais aceito.
  assert.equal(createIncidentSchema.safeParse({ referencePoint: 'Posto 3' }).success, false);
  assert.equal(createIncidentSchema.safeParse({ wristbandToken: 'abc', referencePoint: 'Posto 3' }).success, false);
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
test('lista pagina por cursor sem perder nenhuma das 105 ocorrencias e nunca busca mais que limit+1', async () => {
  const rows = Array.from({ length: 105 }, (_, i) => ({
    id: `inc-${String(i).padStart(3, '0')}`,
    createdAt: new Date(2026, 0, 1, 0, 0, 105 - i),
    latitude: 0,
    longitude: 0,
  }));
  mock.method(prisma.incident, 'findMany', async (query) => {
    assert.ok(query.take <= 21, `take deve ser <= 21 (limit padrao 20 + 1), recebeu ${query.take}`);
    const startIndex = query.cursor ? rows.findIndex((r) => r.id === query.cursor.id) + 1 : 0;
    return rows.slice(startIndex, startIndex + query.take);
  });
  mock.method(prisma.incident, 'count', async () => rows.length);
  const tents = mock.method(prisma.tent, 'findMany', async () => []);

  const collected = [];
  let cursor;
  let total;
  let pages = 0;
  do {
    const result = await request(cursor ? `/incidents?cursor=${cursor}` : '/incidents');
    assert.equal(result.status, 200);
    assert.ok(result.body.items.length <= 20);
    collected.push(...result.body.items);
    total = result.body.total;
    cursor = result.body.nextCursor;
    pages++;
  } while (cursor && pages < 20);

  assert.equal(collected.length, 105);
  assert.equal(total, 105);
  assert.equal(new Set(collected.map((i) => i.id)).size, 105, 'nenhum item duplicado entre paginas');
  assert.equal(tents.mock.callCount(), pages, 'tendas buscadas uma vez por pagina, nunca por item');
});
test('lista de ocorrencias no mapa (open=true) exclui finalizadas e usa teto de seguranca, nao busca sem limite', async () => {
  mock.method(prisma.incident, 'findMany', async (query) => {
    assert.deepEqual(query.where, { AND: [{ status: { notIn: ['REENCONTRO_REALIZADO', 'CANCELADA'] } }] });
    assert.equal(query.take, 501);
    return [];
  });
  mock.method(prisma.incident, 'count', async () => 0);
  mock.method(prisma.tent, 'findMany', async () => []);
  const result = await request('/incidents?open=true');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body.items, []);
});
test('busca por numero da pulseira filtra no servidor, nao so na pagina carregada', async () => {
  mock.method(prisma.incident, 'findMany', async (query) => {
    assert.deepEqual(query.where.AND.find((c) => c.wristband), { wristband: { printedNumber: { contains: '4821' } } });
    return [];
  });
  mock.method(prisma.incident, 'count', async () => 0);
  mock.method(prisma.tent, 'findMany', async () => []);
  assert.equal((await request('/incidents?search=4821')).status, 200);
});
test('busca por pulseira inclui historico antigo mesmo sem includeHistory (achado encontrado em prod: busca dizia "nao encontrado" pra pulseira que so existia fora da janela padrao)', async () => {
  mock.method(prisma.incident, 'findMany', async (query) => {
    assert.deepEqual(query.where, { AND: [{ wristband: { printedNumber: { contains: '4821' } } }] });
    return [];
  });
  mock.method(prisma.incident, 'count', async () => 0);
  mock.method(prisma.tent, 'findMany', async () => []);
  assert.equal((await request('/incidents?search=4821')).status, 200);
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
  assert.equal((await request('/families/intake', { responsibleName: 'Pessoa', responsiblePhone: '27999990000', children: [{ firstName: 'Ana', printedNumber: '4821' }] })).status, 409);
});
test('cadastro cria varias criancas na mesma familia, cada uma com sua pulseira, e guarda o endereco', async () => {
  const families = [], children = [], created = [], updated = [], audits = [];
  transaction({
    wristband: {
      findUnique: async ({ where }) => (where.printedNumber === '4822' ? { id: 'w-4822', status: 'DISPONIVEL' } : null),
      create: async ({ data }) => { created.push(data); return { id: 'w-' + data.printedNumber, ...data }; },
      update: async ({ where, data }) => { updated.push({ id: where.id, ...data }); return { id: where.id, ...data }; },
    },
    family: { create: async ({ data }) => { families.push(data); return { id: 'f1', ...data }; } },
    child: { create: async ({ data }) => { children.push(data); return { id: 'c' + children.length, ...data }; } },
    auditLog: { create: async ({ data }) => { audits.push(data); } },
  });
  const result = await request('/families/intake', {
    responsibleName: 'Carlos Almeida', responsiblePhone: '27999990000', responsibleAddress: '  Rua das Palmeiras, 10 - Guarapari  ',
    children: [{ firstName: 'Lucas', printedNumber: '4821' }, { firstName: 'Ana', printedNumber: '4822', optionalIdentificationNote: 'Camisa azul' }],
  });
  assert.equal(result.status, 201);
  assert.equal(families.length, 1);
  assert.equal(families[0].responsibleAddress, 'Rua das Palmeiras, 10 - Guarapari');
  assert.deepEqual(children.map((c) => [c.familyId, c.firstName]), [['f1', 'Lucas'], ['f1', 'Ana']]);
  assert.deepEqual(created.map((w) => [w.printedNumber, w.childId, w.status]), [['4821', 'c1', 'ATIVA']]);
  assert.deepEqual(updated.map((w) => [w.id, w.childId, w.status]), [['w-4822', 'c2', 'ATIVA']]);
  assert.equal(result.body.children.length, 2);
  assert.equal(audits.length, 3);
});
test('cadastro sem endereco grava nulo e nao exige o campo', async () => {
  let family;
  transaction({
    wristband: { findUnique: async () => null, create: async ({ data }) => ({ id: 'w', ...data }) },
    family: { create: async ({ data }) => { family = data; return { id: 'f', ...data }; } },
    child: { create: async ({ data }) => ({ id: 'c', ...data }) },
    auditLog: { create: async () => {} },
  });
  const result = await request('/families/intake', { responsibleName: 'Pessoa', responsiblePhone: '27999990000', responsibleAddress: '', children: [{ firstName: 'Ana', printedNumber: '1' }] });
  assert.equal(result.status, 201);
  assert.equal(family.responsibleAddress, null);
});
test('cadastro recusa pulseira repetida na mesma familia e lista de criancas vazia', async () => {
  const base = { responsibleName: 'Pessoa', responsiblePhone: '27999990000' };
  const repeated = await request('/families/intake', { ...base, children: [{ firstName: 'Ana', printedNumber: '7' }, { firstName: 'Bia', printedNumber: '7' }] });
  assert.equal(repeated.status, 400);
  assert.equal((await request('/families/intake', { ...base, children: [] })).status, 400);
  assert.equal((await request('/families/intake', { ...base, children: Array.from({ length: 11 }, (_, i) => ({ firstName: 'C' + i, printedNumber: String(i) })) })).status, 400);
});
test('cadastro e tudo ou nada: pulseira ocupada no meio da lista nao cria familia nem criancas', async () => {
  let wrote = false;
  transaction({
    wristband: { findUnique: async ({ where }) => (where.printedNumber === '2' ? { id: 'b', status: 'ATIVA' } : null) },
    family: { create: async () => { wrote = true; } },
    child: { create: async () => { wrote = true; } },
  });
  const result = await request('/families/intake', { responsibleName: 'Pessoa', responsiblePhone: '27999990000', children: [{ firstName: 'Ana', printedNumber: '1' }, { firstName: 'Bia', printedNumber: '2' }] });
  assert.equal(result.status, 409);
  assert.equal(wrote, false);
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
    ], update: async ({ where, data }) => { updated.push(where.id); assert.equal(data.responsiblePhone, ANONYMIZED_LABEL); assert.equal(data.responsibleAddress, null); } },
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
test('lista de usuarios pagina por cursor e busca por nome/e-mail no servidor', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: `u-${i}`, name: `Usuario ${i}`, email: `u${i}@teste.com` }));
  mock.method(prisma.user, 'findMany', async (query) => {
    assert.ok(query.take <= 21);
    const startIndex = query.cursor ? rows.findIndex((r) => r.id === query.cursor.id) + 1 : 0;
    return rows.slice(startIndex, startIndex + query.take);
  });
  mock.method(prisma.user, 'count', async () => rows.length);
  const collected = [];
  let cursor;
  do {
    const result = await request(cursor ? `/users?cursor=${cursor}` : '/users');
    assert.equal(result.status, 200);
    collected.push(...result.body.items);
    cursor = result.body.nextCursor;
  } while (cursor);
  assert.equal(collected.length, 25);
});
test('busca de usuarios usa OR case-insensitive em nome e e-mail, nunca filtra so no cliente', async () => {
  mock.method(prisma.user, 'findMany', async (query) => {
    assert.deepEqual(query.where, {
      OR: [{ name: { contains: 'maria', mode: 'insensitive' } }, { email: { contains: 'maria', mode: 'insensitive' } }],
    });
    return [];
  });
  mock.method(prisma.user, 'count', async () => 0);
  assert.equal((await request('/users?search=maria')).status, 200);
});
test('lista de familias pagina por cursor (sem teto fixo de 50) e nunca inclui cadastros anonimizados', async () => {
  mock.method(prisma.family, 'findMany', async (query) => {
    assert.equal(query.where.responsibleName.not, '[dado removido - retencao LGPD]');
    assert.ok(query.take <= 21);
    return [];
  });
  mock.method(prisma.family, 'count', async () => 0);
  const result = await request('/families');
  assert.equal(result.status, 200);
  assert.deepEqual(result.body, { items: [], nextCursor: null, total: 0 });
});
test('listas de referencia (praias/tendas/equipes) tem teto de seguranca, nunca consulta sem limite', async () => {
  const beaches = mock.method(prisma.beach, 'findMany', async (query) => { assert.equal(query.take, 300); return []; });
  assert.equal((await request('/beaches')).status, 200);
  assert.equal(beaches.mock.callCount(), 1);

  const tents = mock.method(prisma.tent, 'findMany', async (query) => { assert.equal(query.take, 300); return []; });
  assert.equal((await request('/tents')).status, 200);
  assert.equal(tents.mock.callCount(), 1);

  const teams = mock.method(prisma.team, 'findMany', async (query) => { assert.equal(query.take, 300); return []; });
  assert.equal((await request('/teams')).status, 200);
  assert.equal(teams.mock.callCount(), 1);
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
test('Socket.IO desconecta a sessao revogada no logout', async () => {
  const socket = connectSocket(base, { autoConnect: false, reconnection: false, transports: ['websocket'], extraHeaders: { Authorization: `Bearer ${token}` } });
  try {
    const connected = socketEvent(socket, 'connect'); socket.connect(); await connected;
    mock.method(prisma.revokedSession, 'findUnique', async () => ({ jti: 'test-session' }));
    const disconnected = socketEvent(socket, 'disconnect');
    let leaked = false;
    socket.on('incident:updated', () => { leaked = true; });
    await publishIncident('incident:updated', { id: 'private-event' });
    await disconnected;
    assert.equal(leaked, false);
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
