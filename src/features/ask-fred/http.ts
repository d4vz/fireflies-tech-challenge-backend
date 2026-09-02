import {
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
import type { MeetingListPage, MeetingListQuery } from "../meetings/list-query.ts";
import type { TranscriptHit, TranscriptSearchQuery } from "../meetings/search.ts";
import { askFredSystemPrompt } from "./prompt.ts";
import { createAskFredTools } from "./tools.ts";

export type AskFredDeps = {
  model: LanguageModel;
  listMeetings: (query: MeetingListQuery) => Promise<MeetingListPage>;
  searchTranscripts: (query: TranscriptSearchQuery) => Promise<TranscriptHit[]>;
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

export function mountAskFred(app: Hono, deps: AskFredDeps): void {
  app.post("/ask-fred", async (c) => {
    let request: AskFredRequest;
    try {
      request = await readAskFredMessages(await c.req.json());
    } catch {
      return c.json({ error: "invalid body" }, 400);
    }
    const result = streamText({
      model: deps.model,
      system: askFredSystemPrompt(new Date()),
      messages: await convertToModelMessages(request.messages),
      tools: createAskFredTools(deps),
      stopWhen: stepCountIs(5),
      maxOutputTokens: 8192,
    });
    return createUIMessageStreamResponse({
      stream: toUIMessageStream({ stream: result.stream }),
    });
  });
}
