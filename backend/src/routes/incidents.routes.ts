import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { audit } from "../utils/audit";
import { IncidentStatus, INCIDENT_STATUSES } from "../constants/enums";
import { findNearestTent } from "../utils/geo";
import { publishIncident } from "../lib/io";
import { serializable } from "../lib/transaction";
import { HttpError } from "../utils/httpError";
import { operationDayStart } from "../utils/time";
import { familyStatusMessage, sendFamilyMessage } from "../lib/notify";

// Enriquece uma ocorrencia com a tenda ativa mais proxima (item 13/24.2),
// calculada sob demanda a partir da localizacao - nada e persistido, pois
// as tendas podem mudar de posicao entre edicoes do evento.
async function withNearestTent<T extends { latitude: number | null; longitude: number | null }>(
  incident: T,
  availableTents?: { id: string; name: string; latitude: number; longitude: number }[]
): Promise<T & { nearestTent: { id: string; name: string; distanceMeters: number } | null }> {
  if (incident.latitude == null || incident.longitude == null) {
    return { ...incident, nearestTent: null };
  }
  const tents = availableTents ?? await prisma.tent.findMany({ where: { active: true } });
  const nearest = findNearestTent({ latitude: incident.latitude, longitude: incident.longitude }, tents);
  return {
    ...incident,
    nearestTent: nearest
      ? { id: nearest.tent.id, name: nearest.tent.name, distanceMeters: Math.round(nearest.distanceMeters) }
      : null,
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

router.get("/", asyncHandler(async (req, res) => {
  const parsed = z.enum(INCIDENT_STATUSES).optional().safeParse(req.query.status);
  if (!parsed.success) throw new HttpError(400, "Status invalido.");
  const statusFilter = parsed.data;
  const incidents = await prisma.incident.findMany({
    where: statusFilter ? { status: statusFilter } : undefined,
    include: {
      wristband: true,
      beach: true,
      assignedTeam: true,
    },
    orderBy: { createdAt: "desc" },
  });
  const tents = await prisma.tent.findMany({ where: { active: true } });
  const enriched = await Promise.all(incidents.map((incident) => withNearestTent(incident, tents)));
  res.json(enriched);
}));

router.get("/summary", asyncHandler(async (_req, res) => {
  const [open, enRoute, inService, resolvedToday] = await Promise.all([
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
  ]);
  res.json({ open, enRoute, inService, resolvedToday });
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
  res.json(await withNearestTent(incident));
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
