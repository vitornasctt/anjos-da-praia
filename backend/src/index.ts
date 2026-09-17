import http from "http";
import { app } from "./app";
import { env } from "./config/env";
import { initIo } from "./lib/io";
import { startRetentionSchedule } from "./jobs/dataRetention";

const server = http.createServer(app);
initIo(server);
startRetentionSchedule();

server.listen(env.port, () => {
  console.log(`Anjos da Praia API rodando em http://localhost:${env.port}`);
});
