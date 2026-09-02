import type { ErrorHandler } from "hono";

export const onError: ErrorHandler = (error, c) => {
  const message = error instanceof Error ? error.message : "unknown error";
  return c.json({ error: message }, 500);
};
