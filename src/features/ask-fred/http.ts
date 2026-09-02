import {
  consumeStream,
  convertToModelMessages,
  createUIMessageStreamResponse,
  stepCountIs,
  streamText,
  toUIMessageStream,
  validateUIMessages,
  type LanguageModel,
  type UIMessage,
} from "ai";
import type { Hono } from "hono";
import { z } from "zod";
import type { Actor } from "../../lib/auth/index.ts";
import type { AppEnv } from "../../lib/middleware/index.ts";
import { askFredSystemPrompt, parseAskFredOrigin } from "./prompt.ts";
import { createAskFredTools } from "./tools.ts";

export const ASK_FRED_REASONING_EFFORT = "medium";

export type AskFredHttpDeps = {
  model: LanguageModel;
  origin?: string;
  toolsFor: (actor: Actor) => ReturnType<typeof createAskFredTools>;
};

export type AskFredRequest = {
  messages: UIMessage[];
};

const askFredBodySchema = z.object({
  messages: z.array(z.unknown()),
});

// JSON from the client is untyped until this parse.
// oxlint-disable-next-line anti-slop/no-unknown-parameters
export async function readAskFredMessages(input: unknown): Promise<AskFredRequest> {
  const body = askFredBodySchema.parse(input);
  return { messages: await validateUIMessages({ messages: body.messages }) };
}

export function mountAskFred(app: Hono<AppEnv>, deps: AskFredHttpDeps): void {
  app.post("/ask-fred", async (c) => {
    let request: AskFredRequest;
    try {
      request = await readAskFredMessages(await c.req.json());
    } catch {
      return c.json({ error: "invalid body" }, 400);
    }
    const origin = parseAskFredOrigin(deps.origin);
    if (origin === undefined) {
      return c.json({ error: "invalid origin" }, 400);
    }
    const abortSignal = c.req.raw.signal;
    const result = streamText({
      model: deps.model,
      system: askFredSystemPrompt(new Date(), origin),
      messages: await convertToModelMessages(request.messages),
      tools: deps.toolsFor(c.get("actor")),
      stopWhen: stepCountIs(5),
      maxOutputTokens: 8192,
      abortSignal,
      providerOptions: {
        openai: { reasoningEffort: ASK_FRED_REASONING_EFFORT },
      },
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
      consumeSseStream: ({ stream }) => consumeStream({ abortSignal, stream }),
    });
  });
}
