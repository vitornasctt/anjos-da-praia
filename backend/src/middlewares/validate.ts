import { NextFunction, Request, Response } from "express";
import { z, ZodTypeAny } from "zod";

export const activeSchema = z.object({ active: z.boolean() }).strict();

export function validateBody(schema: ZodTypeAny) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({
        error: "Dados invalidos.",
        details: result.error.flatten().fieldErrors,
        formErrors: result.error.flatten().formErrors,
      });
    }
    req.body = result.data;
    next();
  };
}
