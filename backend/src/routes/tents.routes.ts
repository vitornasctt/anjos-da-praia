import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody, activeSchema } from "../middlewares/validate";
import { audit } from "../utils/audit";

const router = Router();
router.use(authenticate);

// Ver comentario equivalente em beaches.routes.ts: lista de referencia que
// a UI precisa inteira, so com um teto de seguranca contra crescimento
// sem limite ao longo de varias temporadas.
const REFERENCE_LIST_SAFETY_LIMIT = 300;

router.get("/", authorize("ADMIN", "ATENDENTE", "EQUIPE_CAMPO"), asyncHandler(async (_req, res) => {
  const tents = await prisma.tent.findMany({ orderBy: { name: "asc" }, include: { beach: true }, take: REFERENCE_LIST_SAFETY_LIMIT });
  res.json(tents);
}));

const tentSchema = z.object({
  beachId: z.string(),
  name: z.string().trim().min(1).max(80),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
});

router.post("/", authorize("ADMIN"), validateBody(tentSchema), asyncHandler(async (req, res) => {
  const tent = await prisma.tent.create({ data: req.body });
  res.status(201).json(tent);
}));

router.patch("/:id", validateBody(activeSchema), authorize("ADMIN"), asyncHandler(async (req, res) => {
  const tent = await prisma.tent.update({
    where: { id: req.params.id },
    data: { active: req.body.active },
  });
  res.json(tent);
}));

router.delete("/:id", authorize("ADMIN"), asyncHandler(async (req, res) => {
  await prisma.tent.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, "DELETE", "Tent", req.params.id);
  res.json({ ok: true });
}));

export default router;
