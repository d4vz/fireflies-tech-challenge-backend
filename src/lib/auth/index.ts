export type OwnerId = string & { readonly __brand: "OwnerId" };

export type Actor = { readonly id: OwnerId };

export type AuthVerify = {
  verifyBearer: (authorizationHeader: string | undefined) => Promise<Actor>;
};

export class AuthError extends Error {
  constructor(message = "unauthorized") {
    super(message);
    this.name = "AuthError";
  }
}

export function ownerId(raw: string): OwnerId {
  if (raw === "") {
    throw new AuthError();
  }
  // SAFETY: non-empty Clerk `sub` / test Bearer token is the owner id.
  return raw as OwnerId;
}
