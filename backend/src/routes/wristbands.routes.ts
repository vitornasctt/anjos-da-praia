import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";

const router = Router();
router.use(authenticate, authorize("ADMIN", "ATENDENTE"));

// Busca rapida por numero de pulseira (indice dedicado no schema).
router.get("/search", asyncHandler(async (req, res) => {
  const printedNumber = String(req.query.printedNumber ?? "").trim();
  if (!printedNumber) return res.status(400).json({ error: "Informe o numero da pulseira." });

  const wristband = await prisma.wristband.findUnique({
    where: { printedNumber },
    include: { child: { include: { family: true } } },
  });

  if (!wristband) return res.status(404).json({ error: "Pulseira nao encontrada." });
  res.json(wristband);
}));

export default router;
