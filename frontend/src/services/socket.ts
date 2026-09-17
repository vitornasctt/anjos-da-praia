import { io, Socket } from "socket.io-client";

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api";
const SOCKET_URL = API_URL.replace(/\/api\/?$/, "");

let socket: Socket | null = null;

// Notificacoes em tempo real do painel (diferencial). Se a conexao cair -
// ou, como em producao serverless, nunca existir - o polling do dashboard
// continua funcionando como rede de seguranca. Quando VITE_API_URL e um
// caminho relativo (build de producao atras do proxy da Vercel), nao ha
// URL absoluta para abrir WebSocket, entao a conexao nem e tentada.
export function getSocket(): Socket | null {
  if (!SOCKET_URL) return null;
  if (!socket) {
    socket = io(SOCKET_URL, { withCredentials: true });
  }
  return socket;
}

export function disconnectSocket() {
  socket?.disconnect();
  socket = null;
}
