export type Queue = {
  enqueue: (meetingId: string) => Promise<void>;
};
