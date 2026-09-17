import { app } from "../src/app";

// Entrada serverless (Vercel): o app Express e usado diretamente como
// handler. Sem servidor HTTP persistente aqui, entao Socket.IO/node-cron
// (ver src/index.ts, usado so em dev local) nao rodam em producao - o
// painel cai para o polling e a retencao roda via Vercel Cron
// (ver api/cron/retention.ts), conforme combinado.
export default app;
