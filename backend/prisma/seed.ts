import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

// Dados exclusivamente ficticios, para demonstracao do Hackathon (item 17/26).
async function main() {
  const passwordHash = await bcrypt.hash("senha123", 10);

  await prisma.user.upsert({
    where: { email: "admin@anjosdapraia.org" },
    update: {},
    create: {
      name: "Admin Anjos da Praia",
      email: "admin@anjosdapraia.org",
      passwordHash,
      role: "ADMIN",
    },
  });

  await prisma.user.upsert({
    where: { email: "atendente@anjosdapraia.org" },
    update: {},
    create: {
      name: "Ana Atendente",
      email: "atendente@anjosdapraia.org",
      passwordHash,
      role: "ATENDENTE",
    },
  });

  await prisma.user.upsert({
    where: { email: "equipe@anjosdapraia.org" },
    update: {},
    create: {
      name: "Equipe de Campo 1",
      email: "equipe@anjosdapraia.org",
      passwordHash,
      role: "EQUIPE_CAMPO",
    },
  });

  const beach = await prisma.beach.upsert({
    where: { id: "beach-camburi" },
    update: {},
    create: { id: "beach-camburi", name: "Praia de Camburi", city: "Vitoria" },
  });

  await prisma.tent.upsert({
    where: { id: "tent-camburi-1" },
    update: {},
    create: {
      id: "tent-camburi-1",
      beachId: beach.id,
      name: "Tenda Anjos da Praia - Posto 1",
      latitude: -20.2843,
      longitude: -40.2917,
      active: true,
    },
  });

  await prisma.team.upsert({
    where: { id: "team-1" },
    update: {},
    create: { id: "team-1", name: "Equipe Azul", active: true },
  });

  // Pulseira de demonstracao pronta para o cenario da secao 26.
  await prisma.wristband.upsert({
    where: { printedNumber: "4821" },
    update: {},
    create: { printedNumber: "4821", status: "DISPONIVEL" },
  });

  console.log("Seed concluido.");
  console.log("Login admin:      admin@anjosdapraia.org / senha123");
  console.log("Login atendente:  atendente@anjosdapraia.org / senha123");
  console.log("Login equipe:     equipe@anjosdapraia.org / senha123");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
