const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3333/api";
const REQUEST_TIMEOUT_MS = 15000;

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

function getCookie(name: string): string | null {
  const match = document.cookie.match(new RegExp(`(?:^|; )${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
}

// Wrapper unico para todas as chamadas: sessao via cookie httpOnly
// (credentials: "include"), protecao CSRF via header X-CSRF-Token nas
// requisicoes que alteram estado, timeout (internet instavel na praia) e
// erro tipado com a mensagem do backend.
export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = "GET", body } = options;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (method !== "GET") {
    const csrfToken = getCookie("csrfToken");
    if (csrfToken) headers["X-CSRF-Token"] = csrfToken;
  }

  try {
    const response = await fetch(`${API_URL}${path}`, {
      method,
      headers,
      credentials: "include",
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    const isJson = response.headers.get("content-type")?.includes("application/json");
    const data = isJson ? await response.json() : null;

    if (!response.ok) {
      if (response.status === 401 && !path.startsWith("/public/") && path !== "/auth/login") window.dispatchEvent(new Event("session-expired"));
      throw new ApiError(data?.error ?? "Ocorreu um erro. Tente novamente.", response.status);
    }

    return data as T;
  } catch (err) {
    if (err instanceof ApiError) throw err;
    if (err instanceof DOMException && err.name === "AbortError") {
      throw new ApiError("Tempo de conexao esgotado. Verifique sua internet e tente novamente.", 0);
    }
    throw new ApiError("Nao foi possivel conectar ao servidor.", 0);
  } finally {
    clearTimeout(timeout);
  }
}
