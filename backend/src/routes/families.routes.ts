import { asyncHandler } from "../middlewares/asyncHandler";
import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "../lib/prisma";
import { authenticate, authorize } from "../middlewares/auth";
import { validateBody } from "../middlewares/validate";
import { audit } from "../utils/audit";
import { serializable } from "../lib/transaction";
import { HttpError } from "../utils/httpError";
import { ANONYMIZED_LABEL, FINAL } from "../jobs/dataRetention";
import { paginationQuerySchema, takeForPage, splitPage, MAX_PAGE_SIZE } from "../utils/pagination";

const router = Router();
router.use(authenticate, authorize("ADMIN", "ATENDENTE"));

// Cadastro rapido: familia + crianca + pulseira em uma unica chamada,
// exatamente o fluxo de tenda descrito no briefing (item 5 e 6).
// So coleta o minimo necessario para possibilitar o reencontro (LGPD).
const intakeSchema = z.object({
  responsibleName: z.string().trim().min(2).max(120),
  responsiblePhone: z.string().trim().min(8).max(20),
  childFirstName: z.string().trim().min(1).max(80),
  optionalIdentificationNote: z.string().trim().max(280).optional(),
  printedNumber: z.string().trim().min(1).max(20),
  // Data URL (base64) opcional, ja redimensionada/comprimida no navegador
  // antes do envio (ver IntakePage.tsx) - ajuda a equipe de campo a
  // confirmar a identidade da crianca no momento do reencontro.
  photoUrl: z.string().trim().max(2_000_000).optional(),
});

router.post("/intake", validateBody(intakeSchema), asyncHandler(async (req, res) => {
  const { responsibleName, responsiblePhone, childFirstName, optionalIdentificationNote, printedNumber, photoUrl } = req.body;

  const result = await serializable(async (tx) => {
    const existingWristband = await tx.wristband.findUnique({ where: { printedNumber } });
    if (existingWristband && existingWristband.status !== "DISPONIVEL") throw new HttpError(409, "Esta pulseira ja esta associada a uma crianca.");
    const family = await tx.family.create({
      data: {
        responsibleName,
        responsiblePhone,
        registeredById: req.user!.id,
      },
    });

    const child = await tx.child.create({
      data: {
        familyId: family.id,
        firstName: childFirstName,
        optionalIdentificationNote,
        photoUrl,
      },
    });

    const wristband = existingWristband
      ? await tx.wristband.update({
          where: { id: existingWristband.id },
          data: { childId: child.id, status: "ATIVA" },
        })
      : await tx.wristband.create({
          data: { printedNumber, childId: child.id, status: "ATIVA" },
        });

    await audit(req.user!.id, "CREATE", "Family", family.id, tx);
    await audit(req.user!.id, "CREATE", "Wristband", wristband.id, tx);
    return { family, child, wristband };
  });

  res.status(201).json(result);
}));

const listQuerySchema = paginationQuerySchema.extend({
  search: z.string().trim().max(120).optional(),
});

router.get("/", asyncHandler(async (req, res) => {
  const parsed = listQuerySchema.safeParse(req.query);
  if (!parsed.success) throw new HttpError(400, "Parametros de busca invalidos.");
  const { cursor, search } = parsed.data;
  const limit = Math.min(parsed.data.limit ?? 20, MAX_PAGE_SIZE);

  const where: Prisma.FamilyWhereInput = {
    responsibleName: { not: ANONYMIZED_LABEL, ...(search ? { contains: search, mode: "insensitive" } : {}) },
  };

  const [rows, total] = await Promise.all([
    prisma.family.findMany({
      where,
      include: { children: { include: { wristbands: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      take: takeForPage(limit),
    }),
    prisma.family.count({ where }),
  ]);
  const { items, nextCursor } = splitPage(rows, limit);
  res.json({ items, nextCursor, total });
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const family = await prisma.family.findUnique({
    where: { id: req.params.id },
    include: { children: { include: { wristbands: true } } },
  });
  if (!family) return res.status(404).json({ error: "Familia nao encontrada." });
  res.json(family);
}));

// Apagar dados pessoais sob demanda (LGPD): mesma anonimizacao da rotina
// automatica (ver src/jobs/dataRetention.ts), mas disparada manualmente
// para uma familia especifica, a qualquer momento - nao espera o prazo de
// retencao. So administradores, e nunca com atendimento em andamento
// (a equipe ainda precisa do nome/foto/telefone para o reencontro).
router.delete("/:id/personal-data", authorize("ADMIN"), asyncHandler(async (req, res) => {
  const result = await serializable(async (tx) => {
    const family = await tx.family.findUnique({
      where: { id: req.params.id },
      include: { children: { include: { wristbands: { include: { incidents: true } } } } },
    });
    if (!family) throw new HttpError(404, "Familia nao encontrada.");

    const hasOpenIncident = family.children.some((child) =>
      child.wristbands.some((band) => band.incidents.some((incident) => !FINAL.includes(incident.status)))
    );
    if (hasOpenIncident) throw new HttpError(409, "Existe atendimento em andamento para esta familia. Conclua ou cancele antes de apagar os dados.");

    const childIds = family.children.map((child) => child.id);
    await tx.wristband.updateMany({ where: { childId: { in: childIds }, status: { not: "ENCERRADA" } }, data: { status: "ENCERRADA" } });
    await tx.child.updateMany({
      where: { id: { in: childIds } },
      data: { firstName: ANONYMIZED_LABEL, optionalIdentificationNote: null, photoUrl: null },
    });
    await tx.family.update({
      where: { id: family.id },
      data: { responsibleName: ANONYMIZED_LABEL, responsiblePhone: ANONYMIZED_LABEL },
    });
    await audit(req.user!.id, "ANONYMIZE_MANUAL", "Family", family.id, tx);
    return { ok: true };
  });
  res.json(result);
}));

export default router;
