export type Queue = {
  enqueue: (meetingId: string) => Promise<void>;
};

export { isLastJobAttempt, isRetryableJobError } from "./retry.ts";
