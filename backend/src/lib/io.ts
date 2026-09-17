import type { Server as HttpServer } from "http";
import { Server } from "socket.io";
import { env } from "../config/env";
import { sessionUser } from "../middlewares/auth";

let io: Server | null = null;

// Notificacoes em tempo real para o painel (diferencial, item 24.3).
// O polling do frontend continua como rede de seguranca caso o socket
// caia, entao a falha aqui nunca bloqueia o fluxo critico.
export function initIo(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true },
    allowRequest: (req, callback) => callback(null, !req.headers.origin || req.headers.origin === env.corsOrigin),
  });
  io.use((socket, next) => {
    const cookie = socket.request.headers.cookie?.split(";").map((part) => part.trim()).find((part) => part.startsWith("token="));
    const header = socket.handshake.headers.authorization;
    const token = cookie?.slice(6) ?? (header?.startsWith("Bearer ") ? header.slice(7) : "");
    sessionUser(token).then((user) => {
      socket.data.token = token;
      socket.data.userId = user.id;
      next();
    }).catch(() => next(new Error("Nao autenticado.")));
  });
  return io;
}

// Recheck access before every notification, including token expiration.
export async function publishIncident(event: "incident:created" | "incident:updated", payload: { id: string; status?: string }) {
  if (!io) return;
  await Promise.all([...io.sockets.sockets.values()].map(async (socket) => {
    try {
      await sessionUser(socket.data.token);
      socket.emit(event, payload);
    } catch { socket.disconnect(true); }
  }));
}

export function disconnectUser(userId: string) {
  for (const socket of io?.sockets.sockets.values() ?? []) {
    if (socket.data.userId === userId) socket.disconnect(true);
  }
}

export function getIo(): Server | null {
  return io;
}
