import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { ROLES } from "../constants/enums";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody, activeSchema } from "../middlewares/validate";
import { audit } from "../utils/audit";
import { disconnectUser } from "../lib/io";

const router = Router();
router.use(authenticate, authorize("ADMIN"));

router.get("/", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    select: { id: true, name: true, email: true, role: true, active: true, createdAt: true },
    orderBy: { createdAt: "desc" },
  });
  res.json(users);
}));

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(72),
  role: z.enum(ROLES),
});

router.post("/", validateBody(createUserSchema), asyncHandler(async (req, res) => {
  const { name, email, password, role } = req.body;

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return res.status(409).json({ error: "Ja existe um usuario com este e-mail." });

  const passwordHash = await bcrypt.hash(password, 10);
  const user = await prisma.user.create({
    data: { name, email, passwordHash, role },
  });

  await audit(req.user!.id, "CREATE", "User", user.id);
  res.status(201).json({ id: user.id, name: user.name, email: user.email, role: user.role });
}));

router.patch("/:id", validateBody(activeSchema), asyncHandler(async (req, res) => {
  if (req.params.id === req.user!.id && !req.body.active) return res.status(400).json({ error: "Voce nao pode desativar sua propria conta." });
  const user = await prisma.user.update({
    where: { id: req.params.id },
    data: { active: req.body.active },
  });
  await audit(req.user!.id, "UPDATE", "User", user.id);
  if (!user.active) disconnectUser(user.id);
  res.json({ id: user.id, active: user.active });
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const target = await prisma.user.findUnique({ where: { id: req.params.id } });
  if (!target) return res.status(404).json({ error: "Usuario nao encontrado." });
  if (target.role === "ADMIN") return res.status(400).json({ error: "Nao e possivel excluir um administrador." });
  await prisma.user.delete({ where: { id: target.id } });
  await audit(req.user!.id, "DELETE", "User", target.id);
  disconnectUser(target.id);
  res.json({ ok: true });
}));

export default router;
