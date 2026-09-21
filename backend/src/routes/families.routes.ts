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
import { personName, phoneSchema } from "../utils/validation";

const router = Router();
router.use(authenticate, authorize("ADMIN", "ATENDENTE"));

// Cadastro rapido: familia + uma ou mais criancas (cada uma com sua pulseira)
// em uma unica chamada, exatamente o fluxo de tenda descrito no briefing
// (item 5 e 6). So coleta o minimo necessario para possibilitar o reencontro
// (LGPD); o endereco e opcional.
export const MAX_CHILDREN_PER_INTAKE = 10;

const intakeChildSchema = z.object({
  firstName: personName("Nome da criança", 80),
  // Numero impresso na pulseira: so digitos (mantem zeros a esquerda, ex.: "0004").
  printedNumber: z.string().trim().min(1).max(20).regex(/^\d+$/, "O numero da pulseira deve ter apenas numeros."),
  optionalIdentificationNote: z.string().trim().max(280).optional(),
  // Data URL (base64) opcional, ja redimensionada/comprimida no navegador
  // antes do envio (ver IntakePage.tsx) - ajuda a equipe de campo a
  // confirmar a identidade da crianca no momento do reencontro. O teto por
  // foto mantem o corpo total (ate MAX_CHILDREN_PER_INTAKE fotos) abaixo do
  // limite de 3 MB do express.json.
  photoUrl: z.string().trim().max(250_000).optional(),
});

const intakeSchema = z.object({
  responsibleName: personName("Nome do responsável", 120),
  responsiblePhone: phoneSchema,
  responsibleAddress: z.string().trim().max(200).optional(),
  children: z.array(intakeChildSchema).min(1).max(MAX_CHILDREN_PER_INTAKE),
}).superRefine((value, ctx) => {
  const seen = new Set<string>();
  value.children.forEach((child, index) => {
    if (seen.has(child.printedNumber)) {
      ctx.addIssue({ code: "custom", path: ["children", index, "printedNumber"], message: "Numero de pulseira repetido no cadastro." });
    }
    seen.add(child.printedNumber);
  });
});

router.post("/intake", validateBody(intakeSchema), asyncHandler(async (req, res) => {
  const { responsibleName, responsiblePhone, responsibleAddress, children } = req.body as z.infer<typeof intakeSchema>;

  const result = await serializable(async (tx) => {
    // Tudo ou nada: se qualquer pulseira ja estiver em uso, nenhuma familia
    // nem crianca e criada.
    const existing = new Map<string, { id: string; status: string }>();
    for (const child of children) {
      const wristband = await tx.wristband.findUnique({ where: { printedNumber: child.printedNumber } });
      if (wristband && wristband.status !== "DISPONIVEL") {
        throw new HttpError(409, `A pulseira ${child.printedNumber} ja esta associada a uma crianca.`);
      }
      if (wristband) existing.set(child.printedNumber, wristband);
    }

    const family = await tx.family.create({
      data: {
        responsibleName,
        responsiblePhone,
        responsibleAddress: responsibleAddress || null,
        registeredById: req.user!.id,
      },
    });
    await audit(req.user!.id, "CREATE", "Family", family.id, tx);

    const created = [];
    for (const item of children) {
      const child = await tx.child.create({
        data: {
          familyId: family.id,
          firstName: item.firstName,
          optionalIdentificationNote: item.optionalIdentificationNote,
          photoUrl: item.photoUrl,
        },
      });
      const available = existing.get(item.printedNumber);
      const wristband = available
        ? await tx.wristband.update({ where: { id: available.id }, data: { childId: child.id, status: "ATIVA" } })
        : await tx.wristband.create({ data: { printedNumber: item.printedNumber, childId: child.id, status: "ATIVA" } });
      await audit(req.user!.id, "CREATE", "Wristband", wristband.id, tx);
      created.push({ child, wristband });
    }
    return { family, children: created };
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
    const wristbandIds = family.children.flatMap((child) => child.wristbands.map((band) => band.id));
    await tx.wristband.updateMany({ where: { childId: { in: childIds }, status: { not: "ENCERRADA" } }, data: { status: "ENCERRADA" } });
    // Telefone de quem encontrou a crianca tambem e dado pessoal: some junto.
    await tx.incident.updateMany({ where: { wristbandId: { in: wristbandIds }, finderPhone: { not: null } }, data: { finderPhone: null } });
    await tx.child.updateMany({
      where: { id: { in: childIds } },
      data: { firstName: ANONYMIZED_LABEL, optionalIdentificationNote: null, photoUrl: null },
    });
    await tx.family.update({
      where: { id: family.id },
      data: { responsibleName: ANONYMIZED_LABEL, responsiblePhone: ANONYMIZED_LABEL, responsibleAddress: null },
    });
    await audit(req.user!.id, "ANONYMIZE_MANUAL", "Family", family.id, tx);
    return { ok: true };
  });
  res.json(result);
}));

export default router;
