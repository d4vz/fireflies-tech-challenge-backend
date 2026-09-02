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
import type { Embed } from "../../lib/embed/index.ts";
import type { AppEnv } from "../../lib/middleware/index.ts";
import {
  listMeetings,
  type MeetingListPage,
  type MeetingListQuery,
} from "../meetings/list-query.ts";
import {
  searchMeetingTranscripts,
  searchTranscripts,
  type MeetingTranscriptSearchQuery,
  type TranscriptHit,
  type TranscriptSearchQuery,
} from "../meetings/search.ts";
import { forActor, type MeetingsStore } from "../meetings/store.ts";
import type { TranscriptsStore } from "../meetings/transcripts.ts";
import { askFredSystemPrompt, parseAskFredOrigin } from "./prompt.ts";
import { createAskFredTools } from "./tools.ts";

export const ASK_FRED_REASONING_EFFORT = "medium";

export type AskFredDeps = {
  model: LanguageModel;
  listMeetings: (query: MeetingListQuery) => Promise<MeetingListPage>;
  searchTranscripts: (query: TranscriptSearchQuery) => Promise<TranscriptHit[]>;
  searchMeetingTranscripts: (query: MeetingTranscriptSearchQuery) => Promise<TranscriptHit[]>;
};

export type AskFredHttpDeps = {
  model: LanguageModel;
  meetings: MeetingsStore;
  transcripts: TranscriptsStore;
  embed: Embed;
  origin?: string;
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
    const owned = forActor(deps.meetings, c.get("actor"));
    const abortSignal = c.req.raw.signal;
    const result = streamText({
      model: deps.model,
      system: askFredSystemPrompt(new Date(), origin),
      messages: await convertToModelMessages(request.messages),
      tools: createAskFredTools({
        model: deps.model,
        listMeetings: (query) => listMeetings(owned, query),
        searchTranscripts: (query) =>
          searchTranscripts(
            { meetings: owned, transcripts: deps.transcripts, embed: deps.embed },
            query,
          ),
        searchMeetingTranscripts: (query) =>
          searchMeetingTranscripts(
            { meetings: owned, transcripts: deps.transcripts, embed: deps.embed },
            query,
          ),
      }),
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
