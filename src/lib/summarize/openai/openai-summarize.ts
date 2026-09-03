import OpenAI from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";
import type { Summarize } from "../index.ts";

const summarySchema = z.object({
  summary: z.string(),
  takeaways: z.array(z.string()),
  actionItems: z.array(z.string()),
});

export function createOpenaiSummarize(model: string): Summarize {
  const client = new OpenAI();
  return {
    run: async (transcript) => {
      const completion = await client.chat.completions.parse({
        model,
        messages: [
          {
            role: "system",
            content:
              "Summarize the meeting. Return a short summary, key takeaways, and action items.",
          },
          { role: "user", content: transcript.length > 0 ? transcript : "(empty transcript)" },
        ],
        response_format: zodResponseFormat(summarySchema, "meeting_summary"),
      });
      const parsed = completion.choices[0]?.message.parsed;
      if (!parsed) {
        throw new Error("summary model returned no parsed output");
      }
      return {
        text: parsed.summary,
        takeaways: parsed.takeaways,
        actionItems: parsed.actionItems,
      };
    },
  };
}
