// Local UI fixture: serves the production build with an in-memory API only.
// Run from frontend: node tests/preview.cjs
const express = require('../../backend/node_modules/express');
const path = require('node:path');
const app = express();
app.use(express.json());
const user = { id: 'fixture-admin', name: 'Administrador de teste', email: 'teste@example.test', role: 'ADMIN', active: true };
const teams = [{ id: 'team', name: 'Equipe de teste', active: true }];
const beaches = [{ id: 'beach', name: 'Praia de teste', city: 'Guarapari' }];
const tents = [{ id: 'tent', name: 'Tenda de teste', beachId: 'beach', beach: beaches[0], latitude: -20.6568, longitude: -40.5039, active: true }];
let incident = { id: 'fixture-incident', status: 'CRIANCA_LOCALIZADA', createdAt: new Date().toISOString(), latitude: -20.6568, longitude: -40.5039, locationAccuracy: 10, assignedTeamId: null, wristband: { printedNumber: '4821', child: { firstName: 'Criança de teste', family: { responsibleName: 'Responsável de teste', responsiblePhone: '00000000000' } } }, statusHistory: [] };
let lastAlert = null;
app.get('/api/auth/me', (_req, res) => res.json(user));
app.post('/api/auth/logout', (_req, res) => res.json({ ok: true }));
app.get('/api/public/wristbands/:number/check', (req, res) => res.json({ exists: req.params.number === '4821' }));
app.get('/api/public/beaches', (_req, res) => res.json(beaches));
app.post('/api/public/incidents', (req, res) => {
  if (req.body.printedNumber !== '4821') return res.status(404).json({ error: 'Pulseira invalida.' });
  lastAlert = req.body;
  res.status(201).json({ id: incident.id, status: incident.status });
});
app.get('/api/public/incidents/:id/status', (_req, res) => res.json({ status: incident.status }));
app.get('/api/incidents/summary', (_req, res) => res.json({ open: 1, enRoute: 0, inService: 0, resolvedToday: 0 }));
const page = (items) => ({ items, nextCursor: null, total: items.length });
const mkIncident = (id, status, number, child, beachName) => ({ ...incident, id, status, wristband: { printedNumber: number, child: { firstName: child, family: { responsibleName: 'Responsável de teste com nome bem comprido da Silva Nascimento', responsiblePhone: '(27) 99999-0000', responsibleAddress: 'Avenida Beira Mar, 1234, Praia do Morro, Guarapari' } } }, beach: { id: 'b', name: beachName, city: 'Guarapari' } });
const incidentList = () => [
  incident,
  mkIncident('i2', 'EQUIPE_A_CAMINHO', '1705', 'Maria Eduarda', 'Praia do Morro'),
  { ...mkIncident('i3', 'EQUIPE_A_CAMINHO', '2340', 'João Pedro Albuquerque', 'Praia de Setiba - Posto de Salva-vidas Norte'), farFromTents: true, nearestTent: { id: 't', name: 'Tenda 6', distanceMeters: 3420 }, finderPhone: '(27) 99888-7766' },
];
app.get('/api/incidents', (_req, res) => res.json(page(incidentList())));
app.get('/api/incidents/:id', (req, res) => res.json(incidentList().find((i) => i.id === req.params.id) ?? incident));
app.patch('/api/incidents/:id/status', (req, res) => { incident = { ...incident, ...req.body }; res.json(incident); });
app.get('/api/teams', (_req, res) => res.json(teams));
app.post('/api/teams', (req, res) => { const team = { id: String(teams.length), name: req.body.name, active: true }; teams.push(team); res.status(201).json(team); });
app.patch('/api/teams/:id', (req, res) => { const team = teams.find((item) => item.id === req.params.id); Object.assign(team, req.body); res.json(team); });
app.get('/api/beaches', (_req, res) => res.json(beaches));
app.get('/api/tents', (_req, res) => res.json(tents));
app.get('/api/users', (_req, res) => res.json(page([user, { id: 'u2', name: 'Atendente com um nome bastante comprido', email: 'atendente.com.email.muito.comprido@anjosdapraia.org', role: 'ATENDENTE', active: true }])));
const familyList = [{ id: 'f1', responsibleName: 'Carlos Almeida de Souza', responsiblePhone: '(27) 99999-0000', responsibleAddress: 'Rua das Palmeiras, 10 - Guarapari', createdAt: new Date().toISOString(), children: [{ id: 'c1', firstName: 'Lucas', wristbands: [{ printedNumber: '4821' }] }, { id: 'c2', firstName: 'Ana Beatriz', wristbands: [{ printedNumber: '4822' }] }] }, { id: 'f2', responsibleName: 'Wesley Ferreira dos Santos Albuquerque Filho', responsiblePhone: '27999399782', responsibleAddress: null, createdAt: new Date().toISOString(), children: [{ id: 'c3', firstName: 'Maria', optionalIdentificationNote: 'Camisa amarela e boné azul', wristbands: [{ printedNumber: '1705' }] }] }, { id: 'f3', responsibleName: 'Vitor', responsiblePhone: '28999297133', createdAt: new Date().toISOString(), children: [{ id: 'c4', firstName: 'Manuela', wristbands: [{ printedNumber: '0004' }] }] }];
app.get('/api/families', (_req, res) => res.json(page(familyList)));
app.post('/api/families/intake', (_req, res) => res.status(201).json({ ok: true }));
app.get('/api/reports/overview', (_req, res) => res.status(503).json({ error: 'Falha simulada para testar a recuperacao da tela.' }));
app.get('/api/fixture/last-alert', (_req, res) => res.json(lastAlert));
app.use('/api', (_req, res) => res.status(404).json({ error: 'Rota ausente na simulacao.' }));
app.use(express.static(path.resolve(__dirname, '../dist')));
app.get('*', (_req, res) => res.sendFile(path.resolve(__dirname, '../dist/index.html')));
app.listen(4174, '127.0.0.1', () => console.log('UI fixture: http://127.0.0.1:4174 (no database)'));
