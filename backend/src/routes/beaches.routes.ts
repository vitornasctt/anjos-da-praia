import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { audit } from "../utils/audit";
import { HttpError } from "../utils/httpError";

const router = Router();
router.use(authenticate);

router.get("/", authorize("ADMIN", "ATENDENTE", "EQUIPE_CAMPO"), asyncHandler(async (_req, res) => {
  const beaches = await prisma.beach.findMany({ orderBy: { name: "asc" }, include: { tents: true } });
  res.json(beaches);
}));

const beachSchema = z.object({
  name: z.string().trim().min(2).max(80),
  city: z.string().trim().min(2).max(80),
});

router.post("/", authorize("ADMIN"), validateBody(beachSchema), asyncHandler(async (req, res) => {
  const beach = await prisma.beach.create({ data: req.body });
  res.status(201).json(beach);
}));

router.delete("/:id", authorize("ADMIN"), asyncHandler(async (req, res) => {
  const tentCount = await prisma.tent.count({ where: { beachId: req.params.id } });
  if (tentCount > 0) throw new HttpError(409, "Remova as tendas desta praia antes de excluir.");
  await prisma.beach.delete({ where: { id: req.params.id } });
  await audit(req.user!.id, "DELETE", "Beach", req.params.id);
  res.json({ ok: true });
}));

export default router;
