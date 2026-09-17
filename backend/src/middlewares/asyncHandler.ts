import type { Request, Response, NextFunction, RequestHandler } from "express";

// Express 4 does not forward rejected promises to the error middleware.
export function asyncHandler(handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown>): RequestHandler {
  return (req, res, next) => { Promise.resolve().then(() => handler(req, res, next)).catch(next); };
}
