import { cors } from "hono/cors";
import type { Hono } from "hono";
import { onError } from "./on-error.ts";

export { parse } from "./parse.ts";

export function mountMiddleware(app: Hono) {
  app.use("*", cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
  app.onError(onError);
}
