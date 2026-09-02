import { verifyToken } from "@clerk/backend";
import { z } from "zod";
import { AuthError, ownerId, type AuthVerify } from "../index.ts";

export const clerkSessionSchema = z.object({
  sub: z.string().min(1),
});

function bearerToken(authorizationHeader: string | undefined): string | undefined {
  const prefix = "Bearer ";
  if (authorizationHeader === undefined || !authorizationHeader.startsWith(prefix)) {
    return undefined;
  }
  const token = authorizationHeader.slice(prefix.length);
  if (token === "") {
    return undefined;
  }
  return token;
}

export function createClerkAuthVerify(secretKey: string): AuthVerify {
  return {
    verifyBearer: async (authorizationHeader) => {
      const token = bearerToken(authorizationHeader);
      if (token === undefined) {
        throw new AuthError();
      }
      try {
        const payload = clerkSessionSchema.parse(await verifyToken(token, { secretKey }));
        return { id: ownerId(payload.sub) };
      } catch {
        throw new AuthError();
      }
    },
  };
}
