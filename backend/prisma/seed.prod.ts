import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "crypto";

const prisma = new PrismaClient();

// Seed de producao: cria APENAS 1 administrador real (senha gerada, nunca
// fixa). Praias, tendas e equipes sao cadastradas pela interface.
// Nao cria contas fixas de demonstracao nem familias/criancas ficticias -
// isso e responsabilidade do seed.ts (usado so em ambiente local/demo).
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL ?? "admin@anjosdapraia.org";
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log("Administrador ja existe, nada a fazer.");
    return;
  }

  const password = process.env.SEED_ADMIN_PASSWORD ?? crypto.randomBytes(9).toString("base64").replace(/[+/=]/g, "").slice(0, 14);
  const passwordHash = await bcrypt.hash(password, 10);

  await prisma.user.create({
    data: { name: "Administrador Anjos da Praia", email, passwordHash, role: "ADMIN" },
  });

  console.log("Administrador criado.");
  console.log("E-mail:", email);
  console.log("Senha (anote agora, nao sera mostrada novamente):", password);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
