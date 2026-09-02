import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { createFfmpegVideo } from "./ffmpeg-video.ts";

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args);
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} exited with ${code}`));
    });
  });
}

test("ffmpeg reports duration and writes a jpeg thumbnail", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  const videoPath = path.join(dir, "clip.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=320x240:rate=1",
    "-pix_fmt",
    "yuv420p",
    videoPath,
  ]);
  const video = createFfmpegVideo();

  const durationInSeconds = await video.durationInSeconds(videoPath);
  const thumb = await video.thumbnail(videoPath);
  const jpeg = new Uint8Array(await thumb.arrayBuffer());

  assert.equal(durationInSeconds, 2);
  assert.equal(thumb.type, "image/jpeg");
  assert.equal(jpeg[0], 0xff);
  assert.equal(jpeg[1], 0xd8);
});

test("ffmpeg extract writes an mp3 beside the input and returns that path", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  const videoPath = path.join(dir, "clip.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=1:size=320x240:rate=1",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=1",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    videoPath,
  ]);
  const video = createFfmpegVideo();
  const audioPath = await video.extract(videoPath);
  const info = await stat(audioPath);

  assert.equal(audioPath, path.join(dir, "audio.mp3"));
  assert.ok(info.size > 0);
});

test("ffmpeg extract fails with the ffmpeg message when the clip has no audio", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  const videoPath = path.join(dir, "silent.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=1:size=320x240:rate=1",
    "-pix_fmt",
    "yuv420p",
    videoPath,
  ]);
  const video = createFfmpegVideo();

  await assert.rejects(
    () => video.extract(videoPath),
    /ffmpeg exited with [\s\S]*(does not contain any stream|Stream map)/i,
  );
});
