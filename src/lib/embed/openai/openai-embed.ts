import OpenAI from "openai";
import type { Embed } from "../index.ts";

export function createOpenaiEmbed(model: string): Embed {
  const client = new OpenAI();
  return {
    model,
    run: async (texts) => {
      if (texts.length === 0) {
        return [];
      }
      const result = await client.embeddings.create({ model, input: texts });
      return result.data
        .slice()
        .sort((left, right) => left.index - right.index)
        .map((item) => item.embedding);
    },
  };
}
