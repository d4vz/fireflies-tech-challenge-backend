import { Queue as BullmqQueue, UnrecoverableError, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Queue } from "../index.ts";
import { isLastJobAttempt, isRetryableJobError } from "../retry.ts";

export const meetingsQueueName = "meetings";
export const processMeetingJob = "process";
export const meetingJobAttempts = 3;
export const meetingJobBackoffMs = 60_000;

export type MeetingJobData = {
  meetingId: string;
};

export type ProcessMeetingJobFn = (
  meetingId: string,
  options: { lastAttempt: boolean },
) => Promise<void>;

function redisConnection(redisUrl: string) {
  return new Redis(redisUrl, { maxRetriesPerRequest: null, family: 0 });
}

export function createBullmqQueue(redisUrl: string): Queue {
  const queue = new BullmqQueue<MeetingJobData>(meetingsQueueName, {
    connection: redisConnection(redisUrl),
    defaultJobOptions: {
      attempts: meetingJobAttempts,
      backoff: { type: "exponential", delay: meetingJobBackoffMs },
      removeOnComplete: true,
      removeOnFail: 100,
    },
  });
  return {
    enqueue: async (meetingId) => {
      await queue.add(processMeetingJob, { meetingId });
    },
  };
}

export function startMeetingsWorker(redisUrl: string, processJob: ProcessMeetingJobFn) {
  return new Worker<MeetingJobData>(
    meetingsQueueName,
    async (job) => {
      try {
        await processJob(job.data.meetingId, {
          lastAttempt: isLastJobAttempt(job.attemptsMade, job.opts.attempts ?? meetingJobAttempts),
        });
      } catch (error) {
        if (error instanceof Error && isRetryableJobError(error)) {
          throw error;
        }
        const message = error instanceof Error ? error.message : "processing failed";
        throw new UnrecoverableError(message);
      }
    },
    { connection: redisConnection(redisUrl), concurrency: 1 },
  );
}
