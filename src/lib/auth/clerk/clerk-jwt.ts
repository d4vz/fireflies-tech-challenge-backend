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

async function verifiedPayload(token: string, secretKey: string, frontendOrigin?: string) {
  try {
    if (frontendOrigin === undefined) {
      return await verifyToken(token, { secretKey });
    }
    return await verifyToken(token, { secretKey, authorizedParties: [frontendOrigin] });
  } catch {
    throw new AuthError();
  }
}

export function createClerkAuthVerify(secretKey: string, frontendOrigin?: string): AuthVerify {
  return {
    verifyBearer: async (authorizationHeader) => {
      const token = bearerToken(authorizationHeader);
      if (token === undefined) {
        throw new AuthError();
      }
      const parsed = clerkSessionSchema.safeParse(
        await verifiedPayload(token, secretKey, frontendOrigin),
      );
      if (!parsed.success) {
        throw new AuthError();
      }
      return { id: ownerId(parsed.data.sub) };
    },
  };
}
