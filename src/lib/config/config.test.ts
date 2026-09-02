import assert from "node:assert/strict";
import { test } from "node:test";
import { parseSecrets, parseSettings } from "./index.ts";

const yaml = `
chunkSize: 500
models:
  transcribe: gpt-4o-transcribe
  summary: gpt-4o-mini
  embed: text-embedding-3-small
  chat: gpt-4o-mini
upload:
  maxFileBytes: 5368709120
  mimeTypes:
    - video/mp4
  extensions:
    - mp4
`;

test("parseSettings reads models, chunk size, and upload limits from yaml", () => {
  const settings = parseSettings(yaml);
  assert.equal(settings.chunkSize, 500);
  assert.equal(settings.models.summary, "gpt-4o-mini");
  assert.equal(settings.models.chat, "gpt-4o-mini");
  assert.equal(settings.upload.maxFileBytes, 5368709120);
});

test("parseSettings rejects yaml that is missing models", () => {
  assert.throws(() => parseSettings("chunkSize: 500\n"));
});

test("parseSecrets reads keys from env and keeps secrets out of yaml", () => {
  const secrets = parseSecrets({
    OPENAI_API_KEY: "sk-test",
    MONGODB_URI: "mongodb://localhost",
    S3_ENDPOINT: "http://localhost:9000",
    S3_ACCESS_KEY: "key",
    S3_SECRET_KEY: "secret",
    S3_BUCKET: "fireflies",
    REDIS_URL: "redis://127.0.0.1:6379",
  });
  assert.equal(secrets.OPENAI_API_KEY, "sk-test");
  assert.equal(secrets.S3_REGION, "us-east-1");
});

test("parseSecrets rejects missing OPENAI_API_KEY", () => {
  assert.throws(() =>
    parseSecrets({
      MONGODB_URI: "mongodb://localhost",
      S3_ENDPOINT: "http://localhost:9000",
      S3_ACCESS_KEY: "key",
      S3_SECRET_KEY: "secret",
      S3_BUCKET: "fireflies",
    }),
  );
});
