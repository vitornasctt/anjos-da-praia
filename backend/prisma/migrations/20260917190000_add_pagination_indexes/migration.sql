-- Indexes to support cursor-based pagination ordered by createdAt on lists
-- that previously had no limit (users, families).
CREATE INDEX "users_createdAt_idx" ON "users"("createdAt");
CREATE INDEX "families_createdAt_idx" ON "families"("createdAt");
