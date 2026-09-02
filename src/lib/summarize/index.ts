export type MeetingSummary = {
  text: string;
  takeaways: string[];
  actionItems: string[];
};

export type Summarize = {
  run: (transcript: string) => Promise<MeetingSummary>;
};
