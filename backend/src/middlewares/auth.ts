import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env";
import { Role, ROLES } from "../constants/enums";
import { prisma } from "../lib/prisma";
import { HttpError } from "../utils/httpError";
import { asyncHandler } from "./asyncHandler";

// Autenticacao obrigatoria. A validacao de permissao NUNCA depende do
// front-end esconder um botao - toda rota sensivel passa por aqui e,
// quando necessario, por authorize().
// Verifica assinatura e validade do JWT. Todo token emitido pelo login tem
// subject (usuario) e jti (id da sessao, usado para revogar no logout);
// tokens sem jti nao sao aceitos porque nao poderiam ser encerrados.
export function verifySessionToken(token: string): (jwt.JwtPayload & { sub: string; jti: string }) | null {
  try {
    const decoded = jwt.verify(token, env.jwtSecret, { algorithms: ["HS256"] });
    if (typeof decoded === "string" || !decoded.sub || !decoded.jti) return null;
    return decoded as jwt.JwtPayload & { sub: string; jti: string };
  } catch { return null; }
}

export async function sessionUser(token: string) {
  const payload = verifySessionToken(token);
  if (!payload) throw new HttpError(401, "Token invalido ou expirado.");
  const [user, revoked] = await Promise.all([
    prisma.user.findUnique({ where: { id: payload.sub }, select: { id: true, name: true, role: true, active: true } }),
    prisma.revokedSession.findUnique({ where: { jti: payload.jti }, select: { jti: true } }),
  ]);
  if (revoked) throw new HttpError(401, "Sessao encerrada. Entre novamente.");
  if (!user?.active || !ROLES.includes(user.role as Role)) throw new HttpError(401, "Sessao encerrada ou usuario inativo.");
  return { id: user.id, name: user.name, role: user.role as Role };
}

export const authenticate = asyncHandler(async (req, res, next) => {
  // Cookie httpOnly e a via principal (nao acessivel via JS, protege contra
  // roubo de token por XSS). O header Bearer fica como alternativa para
  // integracoes que nao usam cookies (ex.: chamadas de servidor a servidor).
  const header = req.headers.authorization;
  const token = req.cookies?.token ?? (header?.startsWith("Bearer ") ? header.slice("Bearer ".length) : null);

  if (!token) {
    return res.status(401).json({ error: "Nao autenticado." });
  }

  req.user = await sessionUser(token);
  next();
});

export function authorize(...roles: Role[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Nao autenticado." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: "Sem permissao para esta acao." });
    }
    next();
  };
}
