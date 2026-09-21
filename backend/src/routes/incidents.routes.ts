import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { audit } from "../utils/audit";
import { IncidentStatus, INCIDENT_STATUSES } from "../constants/enums";
import { findNearestTent, FAR_FROM_TENT_METERS } from "../utils/geo";
import { publishIncident } from "../lib/io";
import { serializable } from "../lib/transaction";
import { HttpError } from "../utils/httpError";
import { operationDayStart } from "../utils/time";
import { familyStatusMessage, sendFamilyMessage } from "../lib/notify";
import { paginationQuerySchema, takeForPage, splitPage, MAX_PAGE_SIZE } from "../utils/pagination";

// Enriquece uma ocorrencia com a tenda ativa mais proxima (item 13/24.2),
// calculada sob demanda a partir da localizacao - nada e persistido, pois
// as tendas podem mudar de posicao entre edicoes do evento.
async function withNearestTent<T extends { latitude: number | null; longitude: number | null }>(
  incident: T,
  availableTents?: { id: string; name: string; latitude: number; longitude: number }[]
): Promise<T & { nearestTent: { id: string; name: string; distanceMeters: number } | null; farFromTents: boolean }> {
  if (incident.latitude == null || incident.longitude == null) {
    return { ...incident, nearestTent: null, farFromTents: false };
  }
  const tents = availableTents ?? await prisma.tent.findMany({ where: { active: true } });
  const nearest = findNearestTent({ latitude: incident.latitude, longitude: incident.longitude }, tents);
  return {
    ...incident,
    nearestTent: nearest
      ? { id: nearest.tent.id, name: nearest.tent.name, distanceMeters: Math.round(nearest.distanceMeters) }
      : null,
    // Com GPS mas longe da tenda ativa mais proxima (ou sem nenhuma tenda ativa
    // por perto): a equipe precisa saber que o deslocamento sera maior.
    farFromTents: nearest ? nearest.distanceMeters > FAR_FROM_TENT_METERS : false,
  };
}

const router = Router();
router.use(authenticate, authorize("ADMIN", "ATENDENTE", "EQUIPE_CAMPO"));

const STATUS_ORDER: IncidentStatus[] = [
  "CRIANCA_LOCALIZADA",
  "EQUIPE_A_CAMINHO",
  "CRIANCA_RECEBIDA_PELA_EQUIPE",
  "RESPONSAVEIS_LOCALIZADOS",
  "REENCONTRO_REALIZADO",
];

function isValidTransition(current: IncidentStatus, next: IncidentStatus): boolean {
  if (next === "CANCELADA") return current !== "REENCONTRO_REALIZADO" && current !== "CANCELADA";
  const currentIndex = STATUS_ORDER.indexOf(current);
  const nextIndex = STATUS_ORDER.indexOf(next);
  if (currentIndex === -1 || nextIndex === -1) return false;
  return nextIndex === currentIndex + 1;
}

// Mesma chave de filtro usada pelos cartoes do Painel (DashboardPage) -
// mantem o contrato da API alinhado 1:1 com o que a UI realmente precisa,
// em vez de expor um filtro de status generico que a UI teria que recompor.
const FILTER_KEYS = ["open", "enRoute", "inService", "resolvedToday"] as const;
type FilterKey = (typeof FILTER_KEYS)[number];

const listQuerySchema = paginationQuerySchema.extend({
  filter: z.enum(FILTER_KEYS).optional(),
  includeHistory: z.enum(["true", "false"]).optional(),
  search: z.string().trim().max(20).optional(),
  // Modo usado pelo mapa: so as ocorrencias em andamento agora, sem
  // paginacao (o mapa precisa do conjunto inteiro para os marcadores),
  // mas com um teto de seguranca - nunca "sem limite".
  open: z.enum(["true"]).optional(),
});

function filterWhere(filter?: FilterKey): Prisma.IncidentWhereInput | undefined {
  switch (filter) {
    case "open":
      return { status: "CRIANCA_LOCALIZADA" };
    case "enRoute":
      return { status: "EQUIPE_A_CAMINHO" };
    case "inService":
      return { status: { in: ["CRIANCA_RECEBIDA_PELA_EQUIPE", "RESPONSAVEIS_LOCALIZADOS"] } };
    case "resolvedToday":
      return { status: "REENCONTRO_REALIZADO", resolvedAt: { gte: operationDayStart() } };
    default:
      return undefined;
  }
}

// Espelha isOldFinalized do DashboardPage: por padrao a lista esconde
// atendimentos ja finalizados em dias anteriores, pra nao poluir a
// primeira pagina com historico irrelevante para a operacao do dia.
function excludeOldFinalizedWhere(): Prisma.IncidentWhereInput {
  return {
    OR: [
      { status: { notIn: ["REENCONTRO_REALIZADO", "CANCELADA"] } },
      { resolvedAt: { gte: operationDayStart() } },
    ],
  };
}

const MAP_SAFETY_LIMIT = 500;

router.get("/", asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Parametros de busca invalidos.");
  const { cursor, filter, includeHistory, search, open } = parsed.data;

  const clauses: Prisma.IncidentWhereInput[] = [];
  if (open === "true") {
    clauses.push({ status: { notIn: ["REENCONTRO_REALIZADO", "CANCELADA"] } });
  } else {
    const forFilter = filterWhere(filter);
    if (forFilter) clauses.push(forFilter);
    // Uma busca por numero de pulseira e um pedido especifico ("cade essa
    // pulseira?"), nao a visao operacional do dia - esconder historico
    // antigo faria a busca dizer "nao encontrado" para algo que existe.
    else if (includeHistory !== "true" && !search) clauses.push(excludeOldFinalizedWhere());
  }
  if (search) clauses.push({ wristband: { printedNumber: { contains: search } } });
  const where: Prisma.IncidentWhereInput | undefined = clauses.length > 0 ? { AND: clauses } : undefined;

  const limit = open === "true" ? MAP_SAFETY_LIMIT : Math.min(parsed.data.limit ?? 20, MAX_PAGE_SIZE);

  const [rows, total] = await Promise.all([
    prisma.incident.findMany({
      where,
      include: { wristband: true, beach: true, assignedTeam: true },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: takeForPage(limit),
    }),
    prisma.incident.count({ where }),
  ]);
  const { items, nextCursor } = splitPage(rows, limit);

  // Tendas ativas buscadas uma unica vez por requisicao e reaproveitadas
  // para enriquecer so os itens da pagina atual, nunca a tabela inteira.
  const tents = await prisma.tent.findMany({ where: { active: true } });
  const enriched = await Promise.all(items.map((incident) => withNearestTent(incident, tents)));
  // O telefone de quem encontrou so vai no detalhe da ocorrencia, nunca na lista.
  const listed = enriched.map(({ finderPhone: _finderPhone, ...rest }) => rest);
  res.json({ items: listed, nextCursor, total });
}));

router.get("/summary", asyncHandler(async (_req, res) => {
  const [open, enRoute, inService, resolvedToday, oldFinalized] = await Promise.all([
    prisma.incident.count({ where: { status: "CRIANCA_LOCALIZADA" } }),
    prisma.incident.count({ where: { status: "EQUIPE_A_CAMINHO" } }),
    prisma.incident.count({
      where: { status: { in: ["CRIANCA_RECEBIDA_PELA_EQUIPE", "RESPONSAVEIS_LOCALIZADOS"] } },
    }),
    prisma.incident.count({
      where: {
        status: "REENCONTRO_REALIZADO",
        resolvedAt: { gte: operationDayStart() },
      },
    }),
    // Quantos atendimentos ficam de fora da visao padrao do Painel (ver
    // excludeOldFinalizedWhere) - contagem no banco em vez de trazer as
    // linhas so pra saber "quantas tem", como o front-end fazia antes.
    prisma.incident.count({ where: { NOT: excludeOldFinalizedWhere() } }),
  ]);
  res.json({ open, enRoute, inService, resolvedToday, oldFinalized });
}));

// Dados minimos do responsavel so aparecem aqui - visao autorizada,
// nunca no fluxo publico do QR Code.
router.get("/:id", asyncHandler(async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
    include: {
      wristband: { include: { child: { include: { family: true } } } },
      beach: true,
      assignedTeam: true,
      statusHistory: { orderBy: { changedAt: "asc" }, include: { changedBy: { select: { id: true, name: true } } } },
    },
  });
  if (!incident) return res.status(404).json({ error: "Ocorrencia nao encontrada." });
  const enriched = await withNearestTent(incident);

  // Sem GPS (quem encontrou usou o formulario de praia/ponto de referencia),
  // mas com praia informada: a tenda de apoio daquela praia vira um ponto
  // aproximado pra abrir no mapa - so nao fica "sem link nenhum" so porque
  // nao temos coordenada exata do achado.
  let beachTent = null;
  if (incident.latitude == null && incident.beachId) {
    beachTent = await prisma.tent.findFirst({
      where: { beachId: incident.beachId, active: true },
      orderBy: { createdAt: "asc" },
      select: { id: true, name: true, latitude: true, longitude: true },
    });
  }

  res.json({ ...enriched, beachTent });
}));

const updateStatusSchema = z.object({
  status: z.enum(INCIDENT_STATUSES),
  assignedTeamId: z.string().optional(),
});

router.patch("/:id/status", validateBody(updateStatusSchema), asyncHandler(async (req, res) => {
  const { status, assignedTeamId } = req.body;

  const { result: updated, child } = await serializable(async (tx) => {
    const incident = await tx.incident.findUnique({
      where: { id: req.params.id },
      include: { wristband: { include: { child: { include: { family: true } } } } },
    });
    if (!incident) throw new HttpError(404, "Ocorrencia nao encontrada.");
    if (status === "CANCELADA" && req.user!.role !== "ADMIN") throw new HttpError(403, "Somente administradores podem cancelar ocorrencias.");
    if (!isValidTransition(incident.status as IncidentStatus, status)) throw new HttpError(409, "A ocorrencia mudou ou a transicao e invalida. Atualize os dados.");
    if (assignedTeamId) {
      const team = await tx.team.findUnique({ where: { id: assignedTeamId } });
      if (!team?.active) throw new HttpError(400, "Selecione uma equipe ativa.");
    }
    const result = await tx.incident.update({
      where: { id: incident.id, status: incident.status },
      data: {
        status,
        assignedTeamId: assignedTeamId ?? incident.assignedTeamId,
        assignedById: assignedTeamId ? req.user!.id : incident.assignedById,
        resolvedAt: ["REENCONTRO_REALIZADO", "CANCELADA"].includes(status) ? new Date() : null,
      },
    });
    await tx.incidentStatusHistory.create({ data: {
      incidentId: incident.id, previousStatus: incident.status, newStatus: status, changedById: req.user!.id,
    } });
    await audit(req.user!.id, "UPDATE_STATUS", "Incident", incident.id, tx);
    return { result, child: incident.wristband?.child };
  });
  await publishIncident("incident:updated", { id: updated.id, status: updated.status });

  if (child?.family?.responsiblePhone) {
    const message = familyStatusMessage(child.firstName, status);
    if (message) void sendFamilyMessage(child.family.responsiblePhone, message);
  }

  res.json(updated);
}));

export default router;
