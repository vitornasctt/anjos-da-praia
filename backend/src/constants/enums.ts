// Fonte unica de verdade para os "enums" da aplicacao. Os valores ficam
// guardados como texto no PostgreSQL (sem enum nativo do banco) e sao
// validados aqui + no Zod nas rotas.

export const ROLES = ["ADMIN", "ATENDENTE", "EQUIPE_CAMPO"] as const;
export type Role = (typeof ROLES)[number];

export const WRISTBAND_STATUSES = ["DISPONIVEL", "ATIVA", "ENCERRADA"] as const;
export type WristbandStatus = (typeof WRISTBAND_STATUSES)[number];

export const INCIDENT_STATUSES = [
  "CRIANCA_LOCALIZADA",
  "EQUIPE_A_CAMINHO",
  "CRIANCA_RECEBIDA_PELA_EQUIPE",
  "RESPONSAVEIS_LOCALIZADOS",
  "REENCONTRO_REALIZADO",
  "CANCELADA",
] as const;
export type IncidentStatus = (typeof INCIDENT_STATUSES)[number];
