import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import rateLimit from "express-rate-limit";
import { prisma } from "../lib/prisma";
import { validateBody } from "../middlewares/validate";
import { publishIncident } from "../lib/io";
import { serializable } from "../lib/transaction";
import { HttpError } from "../utils/httpError";
import { familyStatusMessage, sendFamilyMessage } from "../lib/notify";

const router = Router();

// Endpoint publico e sensivel: sem autenticacao, exposto no QR Code.
// Rate limit agressivo para conter abuso sem bloquear o uso legitimo
// (uma pessoa nao envia dezenas de alertas por minuto).
const publicLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente novamente." },
});
const readLimiter = rateLimit({ windowMs: 5 * 60 * 1000, limit: 300, standardHeaders: true, legacyHeaders: false, message: { error: "Muitas consultas. Aguarde alguns minutos." } });
router.use((req, res, next) => req.method === "GET" ? readLimiter(req, res, next) : next());

// Checagem previa do numero da pulseira, sem expor nenhum dado pessoal,
// so para dar feedback antes de pedir a localizacao.
router.get("/wristbands/:printedNumber/check", asyncHandler(async (req, res) => {
  const printedNumber = req.params.printedNumber.trim();
  const wristband = await prisma.wristband.findUnique({ where: { printedNumber } });
  res.json({ exists: Boolean(wristband && wristband.status === "ATIVA") });
}));

// Suporte ao QR Code individual por pulseira (diferencial futuro, item 6):
// o token publico (publicIdentifier) nunca expõe o ID sequencial interno.
router.get("/wristbands/by-token/:token/check", asyncHandler(async (req, res) => {
  const wristband = await prisma.wristband.findUnique({
    where: { publicIdentifier: req.params.token.trim() },
  });
  res.json({ exists: Boolean(wristband && wristband.status === "ATIVA") });
}));

// Status ao vivo para quem enviou o alerta acompanhar, sem expor
// localizacao nem dados pessoais - so o status. O id da ocorrencia
// funciona como capacidade de acesso (nao e enumeravel, e um cuid).
router.get("/incidents/:id/status", asyncHandler(async (req, res) => {
  const incident = await prisma.incident.findUnique({
    where: { id: req.params.id },
    select: { status: true },
  });
  if (!incident) return res.status(404).json({ error: "Ocorrencia nao encontrada." });
  res.json({ status: incident.status });
}));

router.get("/beaches", asyncHandler(async (_req, res) => {
  // Lista de referencia para o <select> do fallback publico - teto de
  // seguranca, ver mesmo padrao em beaches.routes.ts.
  const beaches = await prisma.beach.findMany({ orderBy: { name: "asc" }, take: 300 });
  res.json(beaches);
}));

export const createIncidentSchema = z
  .object({
    printedNumber: z.string().trim().min(1).max(20).optional(),
    wristbandToken: z.string().trim().min(1).max(128).optional(),
    latitude: z.number().min(-90).max(90).optional(),
    longitude: z.number().min(-180).max(180).optional(),
    locationAccuracy: z.number().nonnegative().optional(),
    beachId: z.string().optional(),
    referencePoint: z.string().trim().max(200).optional(),
  })
  .refine((data) => data.printedNumber || data.wristbandToken, {
    message: "Informe o numero da pulseira.",
  })
  .refine((data) => (data.latitude == null) === (data.longitude == null), { message: "Informe latitude e longitude juntas." })
  .refine((data) => data.latitude != null || Boolean(data.beachId || data.referencePoint), { message: "Informe a localizacao, a praia ou um ponto de referencia." });

router.post("/incidents", publicLimiter, validateBody(createIncidentSchema), asyncHandler(async (req, res) => {
  const { printedNumber, wristbandToken, latitude, longitude, locationAccuracy, beachId, referencePoint } = req.body;
  const result = await serializable(async (tx) => {
    const wristband = await tx.wristband.findUnique({
      where: wristbandToken ? { publicIdentifier: wristbandToken } : { printedNumber },
      include: { child: { include: { family: true } } },
    });
    if (!wristband || wristband.status !== "ATIVA" || !wristband.childId) throw new HttpError(404, "Numero de pulseira nao encontrado.");
    if (beachId && !await tx.beach.findUnique({ where: { id: beachId } })) throw new HttpError(400, "Praia nao encontrada.");
    const existing = await tx.incident.findFirst({
      where: { wristbandId: wristband.id, status: { notIn: ["REENCONTRO_REALIZADO", "CANCELADA"] } },
      orderBy: { createdAt: "desc" },
    });
    if (existing) return { incident: existing, created: false, wristband };
    const incident = await tx.incident.create({ data: {
      wristbandId: wristband.id, latitude, longitude, locationAccuracy, beachId, referencePoint,
      status: "CRIANCA_LOCALIZADA",
      statusHistory: { create: { previousStatus: null, newStatus: "CRIANCA_LOCALIZADA" } },
    } });
    return { incident, created: true, wristband };
  });
  if (result.created) {
    await publishIncident("incident:created", { id: result.incident.id });
    const child = result.wristband.child;
    if (child?.family?.responsiblePhone) {
      const message = familyStatusMessage(child.firstName, "CRIANCA_LOCALIZADA");
      if (message) void sendFamilyMessage(child.family.responsiblePhone, message);
    }
  }
  res.status(result.created ? 201 : 200).json({ id: result.incident.id, status: result.incident.status });
}));

export default router;
