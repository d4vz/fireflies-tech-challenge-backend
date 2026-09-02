import { zValidator } from "@hono/zod-validator";

export function parse(...args: Parameters<typeof zValidator>) {
  const [target, schema] = args;
  return zValidator(target, schema, (result) => {
    if (!result.success) {
      throw result.error;
    }
  });
}
