import { z } from "zod";
import { parse as parseYaml } from "yaml";

const settingsSchema = z.object({
  chunkSize: z.number().int().positive(),
  models: z.object({
    transcribe: z.string().min(1),
    summary: z.string().min(1),
    embed: z.string().min(1),
    chat: z.string().min(1),
  }),
  upload: z.object({
    maxFileBytes: z.number().int().positive(),
    video: z.object({
      mimeTypes: z.array(z.string().min(1)).min(1),
      extensions: z.array(z.string().min(1)).min(1),
    }),
    audio: z.object({
      mimeTypes: z.array(z.string().min(1)).min(1),
      extensions: z.array(z.string().min(1)).min(1),
    }),
  }),
});

const secretsSchema = z.object({
  OPENAI_API_KEY: z.string().min(1),
  MONGODB_URI: z.string().min(1),
  S3_ENDPOINT: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_BUCKET: z.string().min(1),
  S3_REGION: z.string().min(1).default("us-east-1"),
  S3_PUBLIC_ENDPOINT: z.string().min(1).optional(),
  FRONTEND_ORIGIN: z.string().min(1).optional(),
  CLERK_SECRET_KEY: z.string().min(1),
  REDIS_URL: z.string().min(1),
  ASSEMBLYAI_API_KEY: z
    .string()
    .optional()
    .transform((value) => (value === undefined || value.length === 0 ? undefined : value)),
});

export type AppSettings = z.infer<typeof settingsSchema>;
export type AppSecrets = z.infer<typeof secretsSchema>;

export function parseSettings(yamlText: string): AppSettings {
  return settingsSchema.parse(parseYaml(yamlText));
}

export function parseSecrets(env: NodeJS.ProcessEnv): AppSecrets {
  return secretsSchema.parse(env);
}

export async function loadSettings(path: URL): Promise<AppSettings> {
  return parseSettings(await Bun.file(path).text());
}

export const settingsFileUrl = new URL("../../../config.yaml", import.meta.url);
