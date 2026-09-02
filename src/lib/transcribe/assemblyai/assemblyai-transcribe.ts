import { readFile } from "node:fs/promises";
import { z } from "zod";
import type { Transcribe } from "../index.ts";
import { assemblyaiTranscriptSchema, utterancesToTranscript } from "./to-transcript.ts";

export const ASSEMBLYAI_TIMEOUT_MS = 60 * 60 * 1_000;
export const ASSEMBLYAI_POLL_MS = 3_000;

const API = "https://api.assemblyai.com/v2";

const uploadSchema = z.object({ upload_url: z.string().min(1) });
const createdSchema = z.object({ id: z.string().min(1) });
const statusSchema = z.object({
  status: z.string().min(1),
  error: z.string().optional(),
});

export type AssemblyaiHttp = {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
  sleep: (ms: number) => Promise<void>;
  now: () => number;
};

function sleep(ms: number) {
  return new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function readJson(response: Response, failed: string) {
  if (!response.ok) {
    const detail = (await response.text()).trim();
    throw new Error(detail.length > 0 ? `${failed}: ${detail}` : failed);
  }
  return response.json();
}

export function createAssemblyaiTranscribe(
  apiKey: string,
  http: AssemblyaiHttp = { fetch, sleep, now: Date.now },
): Transcribe {
  const headers = { authorization: apiKey };
  return {
    run: async (audioPath) => {
      const started = http.now();
      const uploaded = uploadSchema.parse(
        await readJson(
          await http.fetch(`${API}/upload`, {
            method: "POST",
            headers,
            body: await readFile(audioPath),
          }),
          "AssemblyAI upload failed",
        ),
      );
      const created = createdSchema.parse(
        await readJson(
          await http.fetch(`${API}/transcript`, {
            method: "POST",
            headers: { ...headers, "content-type": "application/json" },
            body: JSON.stringify({
              audio_url: uploaded.upload_url,
              speaker_labels: true,
              language_detection: true,
            }),
          }),
          "AssemblyAI transcript failed",
        ),
      );
      const deadline = started + ASSEMBLYAI_TIMEOUT_MS;
      while (http.now() < deadline) {
        const polled = await readJson(
          await http.fetch(`${API}/transcript/${created.id}`, { headers }),
          "AssemblyAI poll failed",
        );
        const status = statusSchema.parse(polled);
        if (status.status === "completed") {
          return utterancesToTranscript(assemblyaiTranscriptSchema.parse(polled));
        }
        if (status.status === "error") {
          throw new Error(status.error ?? "AssemblyAI transcription failed");
        }
        await http.sleep(ASSEMBLYAI_POLL_MS);
      }
      throw new Error("Request timed out.");
    },
    ping: async () => {
      await readJson(
        await http.fetch(`${API}/transcript?limit=1`, { headers }),
        "AssemblyAI ping failed",
      );
    },
  };
}
