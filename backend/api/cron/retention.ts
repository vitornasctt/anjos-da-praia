import { errorHandler } from "../../src/middlewares/errorHandler";
import type { Request, Response } from "express";
import { purgeOldPersonalData } from "../../src/jobs/dataRetention";

// Vercel Cron chama esta rota diariamente (ver vercel.json). Protegida por
// segredo compartilhado (CRON_SECRET) - Vercel envia automaticamente
// "Authorization: Bearer $CRON_SECRET" nas chamadas geradas pelo Cron
// quando essa variavel de ambiente esta configurada no projeto.
export default async function handler(req: Request, res: Response) {
  const expected = `Bearer ${process.env.CRON_SECRET}`;
  if (!process.env.CRON_SECRET || req.headers.authorization !== expected) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const days = Number(process.env.DATA_RETENTION_DAYS ?? 90);
  try {
    const result = await purgeOldPersonalData(days);
    res.json(result);
  } catch (error) { errorHandler(error, req, res, () => {}); }
}
