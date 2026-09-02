import type { Hono } from "hono";
import { onError } from "./on-error.ts";

export function mountMiddleware(app: Hono) {
  app.onError(onError);
}
