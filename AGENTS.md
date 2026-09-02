# Backend

`features` and capabilities live in `src/`. Boot files are `src/*.ts`.

## Layout

- `src/server.ts` listens. `src/create-app.ts` wires vendors and mounts routes.
- Each feature owns its entity, HTTP, use case, and Store. Meetings persist through `features/meetings/store.ts`.
- `src/lib/<capability>/index.ts` is the interface. The vendor adapter lives under it: `src/lib/blob/minio/minio-blob.ts`, `src/lib/transcribe/openai/openai-transcribe.ts`, `src/lib/summarize/openai/openai-summarize.ts`, `src/lib/video/ffmpeg/ffmpeg-video.ts`.
- `src/lib/config` parses `config.yaml` (models, chunk size, upload limits) and `.env` secrets with Zod. Secrets do not belong in yaml.
- `src/lib/middleware` holds shared Hono handlers. `create-app.ts` mounts them before routes.
- `POST /meetings/upload` streams SSE progress (`storing`, `transcribing`, `summarizing`, `saving`) then `done`. `GET /meetings` lists newest first.
- `src/lib/db/mongo` holds one reusable `MongoClient`. It does not export a generic database interface.

## Import rule

`src/features` import `src/lib/video`, `src/lib/blob`, `src/lib/transcribe`, `src/lib/summarize`, and `src/lib/config` only. A feature Store adapter may use the MongoDB driver. It receives the shared client from `src/server.ts`.

`src/create-app.ts` and `src/server.ts` are the only files that import a vendor folder under a capability (`src/lib/blob/minio`, `src/lib/transcribe/openai`, `src/lib/summarize/openai`, `src/lib/video/ffmpeg`, `src/lib/db/mongo`).

`src/lib/` does not import `src/features`.

## Seam

A capability `index.ts` is the test surface. Feature tests never import a vendor folder. Feature tests fake the feature Store.

Add a vendor adapter only when something actually varies (MinIO vs in-memory).

## Add a capability

1. Write `src/lib/<name>/index.ts` (interface).
2. Write `src/lib/<name>/<vendor>/<vendor>-<name>.ts`.
3. Wire the vendor in `src/create-app.ts` or `src/server.ts`.
4. Done when `bun run check` passes and feature tests import no vendor folder.

## Glossary

- **Meeting** — one uploaded video and the object keys that belong to it.
- **Summary** — structured takeaways and action items produced from the transcript.
- **Store** — the persistence interface for one feature. Each feature defines its own.
