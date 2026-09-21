-- CreateTable
CREATE TABLE "revoked_sessions" (
    "jti" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revoked_sessions_pkey" PRIMARY KEY ("jti")
);

-- CreateIndex
CREATE INDEX "revoked_sessions_expiresAt_idx" ON "revoked_sessions"("expiresAt");

-- A API acessa o banco como dono da tabela (Prisma); o RLS sem politicas
-- impede qualquer acesso direto pela API REST publica do Supabase.
ALTER TABLE "revoked_sessions" ENABLE ROW LEVEL SECURITY;
