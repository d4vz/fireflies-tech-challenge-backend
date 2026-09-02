import { cors } from "hono/cors";
import type { Context, Hono, Next } from "hono";
import type { Actor, AuthVerify } from "../auth/index.ts";
import { onError } from "./on-error.ts";

export type AppEnv = { Variables: { actor: Actor } };

export function mountMiddleware(app: Hono<AppEnv>) {
  app.use("*", cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
  app.onError(onError);
}

export function requireActor(auth: AuthVerify) {
  return async (c: Context<AppEnv>, next: Next) => {
    c.set("actor", await auth.verifyBearer(c.req.header("Authorization")));
    await next();
  };
}
