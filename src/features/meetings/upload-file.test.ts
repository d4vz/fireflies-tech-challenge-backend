import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyUpload, type SavedFile } from "./upload-file.ts";

const rules = {
  maxFileBytes: 5368709120,
  video: {
    mimeTypes: ["video/mp4", "video/webm", "video/quicktime", "video/x-matroska", "video/x-m4v"],
    extensions: ["mp4", "webm", "mov", "mkv", "m4v"],
  },
  audio: {
    mimeTypes: [
      "audio/mpeg",
      "audio/mp3",
      "audio/wav",
      "audio/x-wav",
      "audio/mp4",
      "audio/x-m4a",
      "audio/aac",
      "audio/ogg",
      "audio/flac",
      "audio/webm",
    ],
    extensions: ["mp3", "wav", "m4a", "aac", "ogg", "flac"],
  },
};

function file(name: string, type: string): SavedFile {
  return { name, type, size: 1, path: "/tmp/upload" };
}

test("mp4 classifies as video", () => {
  const classified = classifyUpload(file("clip.mp4", "video/mp4"), rules);
  assert.equal(classified?.kind, "video");
  assert.equal(classified?.name, "clip.mp4");
});

test("mp3 classifies as audio", () => {
  const classified = classifyUpload(file("talk.mp3", "audio/mpeg"), rules);
  assert.equal(classified?.kind, "audio");
  assert.equal(classified?.name, "talk.mp3");
});

test("audio/webm MIME classifies as audio even when the name is .webm", () => {
  const classified = classifyUpload(file("clip.webm", "audio/webm"), rules);
  assert.equal(classified?.kind, "audio");
});

test("codec-suffixed video/webm plus .webm classifies as video", () => {
  const classified = classifyUpload(file("recording.webm", "video/webm;codecs=vp8,opus"), rules);
  assert.equal(classified?.kind, "video");
});

test("audio MIME parameters are stripped before matching", () => {
  const classified = classifyUpload(file("talk.mp3", "audio/mpeg; codecs=mp3"), rules);
  assert.equal(classified?.kind, "audio");
});

test("empty MIME falls back to a video extension", () => {
  const classified = classifyUpload(file("clip.webm", ""), rules);
  assert.equal(classified?.kind, "video");
});

test("empty MIME falls back to an audio extension", () => {
  const classified = classifyUpload(file("talk.mp3", ""), rules);
  assert.equal(classified?.kind, "audio");
});

test("notes.txt is rejected", () => {
  assert.equal(classifyUpload(file("notes.txt", "text/plain"), rules), undefined);
});
