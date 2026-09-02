import type { ErrorHandler } from "hono";
import { ZodError } from "zod";

export const onError: ErrorHandler = (error, c) => {
  if (error instanceof ZodError) {
    return c.json({ error: error.issues[0]?.message ?? "invalid input" }, 400);
  }
  const message = error instanceof Error ? error.message : "unknown error";
  return c.json({ error: message }, 500);
};
