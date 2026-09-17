import { NextFunction, Request, Response } from "express";
import { Prisma } from "@prisma/client";
import { HttpError } from "../utils/httpError";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  if (res.headersSent) return _next(err);
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    if (err.code === "P2002" || err.code === "P2034") return res.status(409).json({ error: "Os dados foram alterados ou ja existem. Atualize e tente novamente." });
    if (err.code === "P2025") return res.status(404).json({ error: "Registro nao encontrado." });
    if (err.code === "P2003") return res.status(400).json({ error: "Registro relacionado invalido." });
  }
  if (err instanceof SyntaxError && "body" in err) return res.status(400).json({ error: "JSON invalido." });
  console.error("Falha interna na requisicao", err instanceof Error ? err.name : "UnknownError");
  res.status(500).json({ error: "Erro interno do servidor." });
}
