import "dotenv/config";

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3333),
  jwtSecret: required("JWT_SECRET"),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  corsOrigin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
  nodeEnv: process.env.NODE_ENV ?? "development",
  // Twilio e opcional: sem essas variaveis, as notificacoes por
  // SMS/WhatsApp para a familia simplesmente nao sao enviadas (ver
  // src/lib/notify.ts), sem quebrar o restante do fluxo.
  twilio: {
    accountSid: process.env.TWILIO_ACCOUNT_SID,
    authToken: process.env.TWILIO_AUTH_TOKEN,
    fromNumber: process.env.TWILIO_FROM_NUMBER,
    channel: process.env.TWILIO_CHANNEL === "whatsapp" ? "whatsapp" as const : "sms" as const,
  },
};
