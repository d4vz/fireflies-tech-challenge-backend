import assert from "node:assert/strict";
import { test } from "node:test";
import { meetingName } from "./meeting-name.ts";

test("meetingName prefers a trimmed stored name and strips a media extension", () => {
  assert.equal(meetingName("clip.mp4", "Standup"), "Standup");
  assert.equal(meetingName("clip.mp4", "  Q2 review  "), "Q2 review");
  assert.equal(meetingName("clip.mp4", "clip.mp4"), "clip");
});

test("meetingName falls back to sourceId without the media suffix", () => {
  assert.equal(
    meetingName("Kevin Kelly The Inevitable Video.mp4"),
    "Kevin Kelly The Inevitable Video",
  );
  assert.equal(meetingName("talk.mp3"), "talk");
  assert.equal(meetingName("notes.WAV"), "notes");
  assert.equal(meetingName("Q2 review.webm"), "Q2 review");
  assert.equal(meetingName("Standup"), "Standup");
});
