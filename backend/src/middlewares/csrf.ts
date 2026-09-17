import { NextFunction, Request, Response } from "express";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Padrao double-submit cookie: so se aplica a requisicoes que ja carregam
// o cookie httpOnly de sessao (token) - login e o fluxo publico do QR Code
// nunca tem esse cookie, entao nunca sao bloqueados por aqui.
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  if (SAFE_METHODS.has(req.method)) return next();
  if (!req.cookies?.token) return next();

  const cookieToken = req.cookies?.csrfToken;
  const headerToken = req.headers["x-csrf-token"];

  if (!cookieToken || headerToken !== cookieToken) {
    return res.status(403).json({ error: "Falha na validacao de seguranca (CSRF). Recarregue a pagina." });
  }
  next();
}
