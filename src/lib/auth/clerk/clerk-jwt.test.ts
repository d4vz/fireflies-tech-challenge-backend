import assert from "node:assert/strict";
import { test } from "node:test";
import { clerkSessionSchema } from "./clerk-jwt.ts";

test("clerkSessionSchema reads sub from a Clerk JWT payload", () => {
  assert.equal(clerkSessionSchema.parse({ sub: "user_2abc" }).sub, "user_2abc");
});

test("clerkSessionSchema rejects the Result wrapper shape", () => {
  assert.equal(
    clerkSessionSchema.safeParse({ data: { sub: "user_2abc" }, errors: undefined }).success,
    false,
  );
});

test("clerkSessionSchema rejects a missing sub", () => {
  assert.equal(clerkSessionSchema.safeParse({ azp: "http://localhost:18080" }).success, false);
});
