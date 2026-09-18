import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody, activeSchema } from "../middlewares/validate";

const router = Router();
router.use(authenticate);

// Ver comentario equivalente em beaches.routes.ts.
const REFERENCE_LIST_SAFETY_LIMIT = 300;

router.get("/", authorize("ADMIN", "ATENDENTE", "EQUIPE_CAMPO"), asyncHandler(async (req, res) => {
  const teams = await prisma.team.findMany({
    where: req.query.includeInactive === "true" && req.user!.role === "ADMIN" ? undefined : { active: true },
    orderBy: { name: "asc" },
    take: REFERENCE_LIST_SAFETY_LIMIT,
  });
  res.json(teams);
}));

const teamSchema = z.object({ name: z.string().trim().min(2).max(80) });

router.post("/", authorize("ADMIN"), validateBody(teamSchema), asyncHandler(async (req, res) => {
  const team = await prisma.team.create({ data: { name: req.body.name } });
  res.status(201).json(team);
}));

router.patch("/:id", validateBody(activeSchema), authorize("ADMIN"), asyncHandler(async (req, res) => {
  const team = await prisma.team.update({
    where: { id: req.params.id },
    data: { active: req.body.active },
  });
  res.json(team);
}));

export default router;
