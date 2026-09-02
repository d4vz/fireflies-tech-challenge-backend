import type { ErrorHandler } from "hono";
import { AuthError } from "../auth/index.ts";

export const onError: ErrorHandler = (error, c) => {
  if (error instanceof AuthError) {
    return c.json({ error: "unauthorized" }, 401);
  }
  const message = error instanceof Error ? error.message : "unknown error";
  return c.json({ error: message }, 500);
};
