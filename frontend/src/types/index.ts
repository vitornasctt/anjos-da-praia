export type Role = "ADMIN" | "ATENDENTE" | "EQUIPE_CAMPO";

export type IncidentStatus =
  | "CRIANCA_LOCALIZADA"
  | "EQUIPE_A_CAMINHO"
  | "CRIANCA_RECEBIDA_PELA_EQUIPE"
  | "RESPONSAVEIS_LOCALIZADOS"
  | "REENCONTRO_REALIZADO"
  | "CANCELADA";

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: Role;
}

export interface Beach {
  id: string;
  name: string;
  city: string;
  tents?: Tent[];
}

export interface Tent {
  id: string;
  beachId: string;
  name: string;
  latitude: number;
  longitude: number;
  active: boolean;
  beach?: Beach;
}

export interface Team {
  id: string;
  name: string;
  active: boolean;
}

export interface Wristband {
  id: string;
  publicIdentifier: string;
  printedNumber: string;
  status: "DISPONIVEL" | "ATIVA" | "ENCERRADA";
  child?: Child;
}

export interface Child {
  id: string;
  familyId: string;
  firstName: string;
  optionalIdentificationNote?: string | null;
  photoUrl?: string | null;
  family?: Family;
  wristbands?: Wristband[];
}

export interface Family {
  id: string;
  responsibleName: string;
  responsiblePhone: string;
  createdAt: string;
  children?: Child[];
}

export interface Incident {
  id: string;
  wristbandId: string;
  latitude: number | null;
  longitude: number | null;
  locationAccuracy: number | null;
  beachId: string | null;
  referencePoint: string | null;
  status: IncidentStatus;
  assignedTeamId: string | null;
  createdAt: string;
  resolvedAt: string | null;
  wristband?: Wristband;
  beach?: Beach | null;
  assignedTeam?: Team | null;
  statusHistory?: IncidentStatusHistoryEntry[];
  nearestTent?: { id: string; name: string; distanceMeters: number } | null;
  // So presente no detalhe (GET /incidents/:id) quando o alerta nao tem GPS
  // mas tem praia informada: tenda de apoio daquela praia, como ponto
  // aproximado pra abrir no mapa (nao e a localizacao exata da crianca).
  beachTent?: { id: string; name: string; latitude: number; longitude: number } | null;
}

export interface IncidentStatusHistoryEntry {
  id: string;
  previousStatus: IncidentStatus | null;
  newStatus: IncidentStatus;
  changedAt: string;
  changedBy?: { name: string } | null;
}

export interface IncidentSummary {
  open: number;
  enRoute: number;
  inService: number;
  resolvedToday: number;
  oldFinalized: number;
}

// Resposta paginada por cursor (keyset), usada por listas que podem
// crescer sem limite (ocorrencias, usuarios, familias).
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}
