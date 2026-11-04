import type { NextFunction, Request, Response } from "express";
import { ZodError } from "zod";
import { logger } from "./logger.js";

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message);
  }
}

export const badRequest = (msg: string, details?: unknown) => new HttpError(400, "BAD_REQUEST", msg, details);
export const notFound = (what: string) => new HttpError(404, "NOT_FOUND", `${what} introuvable.`);
export const conflict = (msg: string, details?: unknown) => new HttpError(409, "CONFLICT", msg, details);
export const unprocessable = (msg: string, details?: unknown) => new HttpError(422, "VALIDATION_ERROR", msg, details);

export function asyncHandler(fn: (req: Request, res: Response, next: NextFunction) => Promise<unknown>) {
  return (req: Request, res: Response, next: NextFunction) => {
    fn(req, res, next).catch(next);
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof ZodError) {
    return res.status(422).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Données invalides : " + err.issues.map((i) => `${i.path.join(".") || "corps"} — ${i.message}`).join(" ; "),
        details: err.issues.map((i) => ({ path: i.path.join("."), message: i.message })),
      },
    });
  }
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: { code: err.code, message: err.message, details: err.details } });
  }
  if ((err as { type?: string })?.type === "entity.parse.failed") {
    return res.status(400).json({ error: { code: "BAD_JSON", message: "Corps JSON invalide." } });
  }
  logger.error("Erreur non gérée", err instanceof Error ? err.stack : String(err));
  return res.status(500).json({ error: { code: "INTERNAL", message: "Erreur interne du serveur." } });
}
