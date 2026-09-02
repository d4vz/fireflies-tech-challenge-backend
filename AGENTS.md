# Backend

`entities` and `features` live in `src/`. Boot files are `src/*.ts`. Capabilities live in `lib/` outside `src/`.

## Layout

- `src/server.ts` listens. `src/create-app.ts` wires vendors and mounts routes.
- `src/entities` holds Meeting keys. `src/features` holds use cases and HTTP.
- `lib/<capability>/index.ts` is the interface. The vendor adapter lives under it: `lib/blob/minio/minio-blob.ts`, `lib/transcribe/openai/openai-transcribe.ts`, `lib/audio/ffmpeg/ffmpeg-audio.ts`.

## Import rule

`src/entities` and `src/features` import `lib/audio`, `lib/blob`, and `lib/transcribe` only.

`src/create-app.ts` and `src/server.ts` are the only files that import a vendor folder under a capability (`lib/blob/minio`, `lib/transcribe/openai`, `lib/audio/ffmpeg`).

`lib/` does not import `src/features`.

## Seam

A capability `index.ts` is the test surface. Feature tests never import a vendor folder.

Add a vendor adapter only when something actually varies (MinIO vs in-memory).

## Add a capability

1. Write `lib/<name>/index.ts` (interface).
2. Write `lib/<name>/<vendor>/<vendor>-<name>.ts`.
3. Wire the vendor in `src/create-app.ts` or `src/server.ts`.
4. Done when `bun run check` passes and feature tests import no vendor folder.

## Glossary

- **Meeting** — one uploaded video and the object keys that belong to it.
- **Transcript** — the text produced from a meeting, stored next to the video.
