import { useCallback, useEffect, useRef, useState } from "react";
import { apiRequest, ApiError } from "../services/api";
import { Page } from "../types";

interface UseCursorPageOptions {
  path: string;
  pageSize: number;
  // Muda a busca (ou o tamanho de pagina) sempre reseta para a primeira
  // pagina - continuar em um cursor antigo depois de trocar o filtro
  // devolveria resultados sem sentido.
  search?: string;
}

// Pilha de cursores visitados: permite "Anterior"/"Proxima" sobre
// paginacao por keyset (cursor), que so anda pra frente nativamente.
export function useCursorPage<T>({ path, pageSize, search }: UseCursorPageOptions) {
  const [items, setItems] = useState<T[]>([]);
  const [total, setTotal] = useState(0);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [cursorStack, setCursorStack] = useState<(string | undefined)[]>([undefined]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  const load = useCallback(async (cursor: string | undefined) => {
    const id = ++requestId.current;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ limit: String(pageSize) });
      if (cursor) params.set("cursor", cursor);
      if (search) params.set("search", search);
      const result = await apiRequest<Page<T>>(`${path}?${params.toString()}`);
      if (id !== requestId.current) return;
      setItems(result.items);
      setTotal(result.total);
      setNextCursor(result.nextCursor);
    } catch (err) {
      if (id !== requestId.current) return;
      setError(err instanceof ApiError ? err.message : "Nao foi possivel carregar a lista.");
    } finally {
      if (id === requestId.current) setLoading(false);
    }
  }, [path, pageSize, search]);

  useEffect(() => {
    setCursorStack([undefined]);
    load(undefined);
  }, [load]);

  function goNext() {
    if (!nextCursor) return;
    const cursor = nextCursor;
    setCursorStack((prev) => [...prev, cursor]);
    load(cursor);
  }

  function goPrevious() {
    if (cursorStack.length <= 1) return;
    const newStack = cursorStack.slice(0, -1);
    setCursorStack(newStack);
    load(newStack[newStack.length - 1]);
  }

  function reload() {
    load(cursorStack[cursorStack.length - 1]);
  }

  return {
    items,
    setItems,
    total,
    loading,
    error,
    hasNext: Boolean(nextCursor),
    hasPrevious: cursorStack.length > 1,
    goNext,
    goPrevious,
    reload,
  };
}
