import { cors } from "hono/cors";
import type { Context, Hono, Next } from "hono";
import { AuthError, type Actor, type AuthVerify } from "../auth/index.ts";
import { onError } from "./on-error.ts";

export type AppEnv = { Variables: { actor: Actor } };

export function mountMiddleware(app: Hono<AppEnv>) {
  app.use("*", cors({ origin: process.env.FRONTEND_ORIGIN || "*" }));
  app.onError(onError);
}

export function mountRequireActor(app: Hono<AppEnv>, auth: AuthVerify) {
  const requireActor = async (c: Context<AppEnv>, next: Next) => {
    try {
      c.set("actor", await auth.verifyBearer(c.req.header("Authorization")));
    } catch (error) {
      if (error instanceof AuthError) {
        return c.json({ error: "unauthorized" }, 401);
      }
      throw error;
    }
    await next();
  };
  app.use("/meetings", requireActor);
  app.use("/meetings/*", requireActor);
  app.use("/ask-fred", requireActor);
}
