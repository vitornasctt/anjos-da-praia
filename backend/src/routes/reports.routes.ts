import { operationHour } from "../utils/time";
import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { findNearestTent } from "../utils/geo";
import { purgeOldPersonalData } from "../jobs/dataRetention";
import { validateBody } from "../middlewares/validate";
import { audit } from "../utils/audit";

const router = Router();
router.use(authenticate, authorize("ADMIN"));

router.get("/overview", asyncHandler(async (_req, res) => {
  const [families, children, reunited, totalIncidents, beaches, tents, incidents] = await Promise.all([
    prisma.family.count(),
    prisma.child.count(),
    prisma.incident.count({ where: { status: "REENCONTRO_REALIZADO" } }),
    prisma.incident.count(),
    prisma.beach.findMany(),
    prisma.tent.findMany({ where: { active: true } }),
    prisma.incident.findMany({
      select: { id: true, createdAt: true, resolvedAt: true, status: true, beachId: true, latitude: true, longitude: true },
    }),
  ]);

  // resolvedAt >= createdAt sempre em uso normal (setado no momento do
  // PATCH de status); o filtro so protege contra dado inconsistente.
  const resolutionTimesMinutes = incidents
    .filter((i) => i.status === "REENCONTRO_REALIZADO" && i.resolvedAt && i.resolvedAt >= i.createdAt)
    .map((i) => (i.resolvedAt!.getTime() - i.createdAt.getTime()) / 60000);
  const avgResolutionMinutes =
    resolutionTimesMinutes.length > 0
      ? Math.round(resolutionTimesMinutes.reduce((sum, m) => sum + m, 0) / resolutionTimesMinutes.length)
      : null;

  // Ocorrencias por praia (item 23)
  const beachNameById = new Map(beaches.map((b) => [b.id, b.name]));
  const incidentsByBeachMap = new Map<string, number>();
  for (const incident of incidents) {
    const label = incident.beachId ? beachNameById.get(incident.beachId) ?? "Praia desconhecida" : "Sem praia informada";
    incidentsByBeachMap.set(label, (incidentsByBeachMap.get(label) ?? 0) + 1);
  }
  const incidentsByBeach = [...incidentsByBeachMap.entries()].map(([beach, count]) => ({ beach, count }));

  // Ocorrencias por tenda mais proxima (diferencial, item 13/24)
  const incidentsByTentMap = new Map<string, number>();
  for (const incident of incidents) {
    if (incident.latitude == null || incident.longitude == null) continue;
    const nearest = findNearestTent({ latitude: incident.latitude, longitude: incident.longitude }, tents);
    if (!nearest) continue;
    incidentsByTentMap.set(nearest.tent.name, (incidentsByTentMap.get(nearest.tent.name) ?? 0) + 1);
  }
  const incidentsByTent = [...incidentsByTentMap.entries()].map(([tent, count]) => ({ tent, count }));

  // Horarios com maior numero de ocorrencias (item 23)
  const incidentsByHourMap = new Map<number, number>();
  for (const incident of incidents) {
    const hour = operationHour(incident.createdAt);
    incidentsByHourMap.set(hour, (incidentsByHourMap.get(hour) ?? 0) + 1);
  }
  const incidentsByHour = [...incidentsByHourMap.entries()]
    .map(([hour, count]) => ({ hour, count }))
    .sort((a, b) => a.hour - b.hour);

  res.json({
    families,
    children,
    totalIncidents,
    reunited,
    avgResolutionMinutes,
    incidentsByBeach,
    incidentsByTent,
    incidentsByHour,
  });
}));

const retentionSchema = z.object({ days: z.number().int().positive().max(3650).optional() });

// Execucao manual da rotina de retencao/expurgo (item 17). A rotina
// automatica tambem roda diariamente (ver src/jobs/dataRetention.ts).
router.post("/data-retention/run", validateBody(retentionSchema), asyncHandler(async (req, res) => {
  const days = req.body.days ?? Number(process.env.DATA_RETENTION_DAYS ?? 90);
  const result = await purgeOldPersonalData(days);
  await audit(req.user!.id, "RUN_RETENTION", "System", "data-retention");
  res.json(result);
}));

export default router;
