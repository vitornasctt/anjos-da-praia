import { prisma } from "../lib/prisma";
import type { Prisma } from "@prisma/client";

export async function audit(
  userId: string | null,
  action: string,
  entityType: string,
  entityId: string,
  client: Prisma.TransactionClient = prisma
) {
  await client.auditLog.create({
    data: { userId, action, entityType, entityId },
  });
}
