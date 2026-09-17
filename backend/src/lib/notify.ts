import { env } from "../config/env";

// Normaliza numeros de telefone brasileiros (com ou sem DDI/DDD, com
// parenteses, espacos, traco) para o formato E.164 exigido pelo Twilio.
function normalizePhoneBR(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) return `+${digits}`;
  return `+55${digits}`;
}

const FAMILY_STATUS_MESSAGE: Partial<Record<string, (childName: string) => string>> = {
  CRIANCA_LOCALIZADA: (name) =>
    `Anjos da Praia: alguem encontrou ${name} na praia! Nossa equipe ja foi avisada e esta se organizando para o reencontro.`,
  EQUIPE_A_CAMINHO: (name) => `Anjos da Praia: nossa equipe esta a caminho para buscar ${name}.`,
  CRIANCA_RECEBIDA_PELA_EQUIPE: (name) =>
    `Anjos da Praia: ${name} esta com a nossa equipe, em seguranca. Aguarde as instrucoes para o reencontro.`,
  RESPONSAVEIS_LOCALIZADOS: (name) =>
    `Anjos da Praia: conseguimos localizar voce! O reencontro com ${name} esta sendo preparado.`,
  REENCONTRO_REALIZADO: (name) => `Anjos da Praia: reencontro com ${name} confirmado! Obrigado por confiar em nos.`,
  CANCELADA: (name) => `Anjos da Praia: o atendimento referente a ${name} foi encerrado pela nossa equipe.`,
};

export function familyStatusMessage(childName: string, status: string): string | null {
  return FAMILY_STATUS_MESSAGE[status]?.(childName) ?? null;
}

// Envio best-effort: falha de mensageria nunca deve derrubar o fluxo
// operacional (criacao/atualizacao de ocorrencia). Sem credenciais
// configuradas, so registra no log e segue.
export async function sendFamilyMessage(rawPhone: string, body: string): Promise<void> {
  const { accountSid, authToken, fromNumber, channel } = env.twilio;
  if (!accountSid || !authToken || !fromNumber) {
    console.warn("[notify] Twilio nao configurado - mensagem nao enviada:", body);
    return;
  }

  const to = normalizePhoneBR(rawPhone);
  const prefix = channel === "whatsapp" ? "whatsapp:" : "";
  const params = new URLSearchParams({
    To: `${prefix}${to}`,
    From: `${prefix}${fromNumber}`,
    Body: body,
  });

  try {
    const auth = Buffer.from(`${accountSid}:${authToken}`).toString("base64");
    const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    });
    if (!response.ok) {
      console.error("[notify] Falha ao enviar mensagem via Twilio:", response.status, await response.text());
    }
  } catch (err) {
    console.error("[notify] Erro ao enviar mensagem via Twilio:", err);
  }
}
