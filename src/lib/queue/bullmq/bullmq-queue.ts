import { Queue as BullmqQueue, Worker } from "bullmq";
import { Redis } from "ioredis";
import type { Queue } from "../index.ts";

export const meetingsQueueName = "meetings";
export const processMeetingJob = "process";

export type MeetingJobData = {
  meetingId: string;
};

function redisConnection(redisUrl: string) {
  return new Redis(redisUrl, { maxRetriesPerRequest: null, family: 0 });
}

export function createBullmqQueue(redisUrl: string): Queue {
  const queue = new BullmqQueue<MeetingJobData>(meetingsQueueName, {
    connection: redisConnection(redisUrl),
    defaultJobOptions: { attempts: 1, removeOnComplete: true, removeOnFail: 100 },
  });
  return {
    enqueue: async (meetingId) => {
      await queue.add(processMeetingJob, { meetingId });
    },
  };
}

export function startMeetingsWorker(
  redisUrl: string,
  processJob: (meetingId: string) => Promise<void>,
) {
  return new Worker<MeetingJobData>(
    meetingsQueueName,
    async (job) => {
      await processJob(job.data.meetingId);
    },
    { connection: redisConnection(redisUrl), concurrency: 1 },
  );
}
