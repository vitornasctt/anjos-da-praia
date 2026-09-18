import { z } from "zod";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

// cursor = id da ultima linha da pagina anterior (keyset pagination, estavel
// mesmo com escritas concorrentes - ao contrario de OFFSET, que pula ou
// repete linhas quando a lista muda entre paginas).
export const paginationQuerySchema = z.object({
  cursor: z.string().trim().min(1).optional(),
  limit: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).optional(),
});

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  total: number;
}

// Busca limit+1 linhas para saber se ha proxima pagina sem uma query extra;
// a linha extra nunca e devolvida ao cliente.
export function takeForPage(limit: number): number {
  return limit + 1;
}

export function splitPage<T extends { id: string }>(rows: T[], limit: number): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
