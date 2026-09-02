import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile } from "node:fs/promises";
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
  const file = new File([await readFile(videoPath)], "clip.mp4", { type: "video/mp4" });
  const video = createFfmpegVideo();

  const durationInSeconds = await video.durationInSeconds(file);
  const thumb = await video.thumbnail(file);
  const jpeg = new Uint8Array(await thumb.arrayBuffer());

  assert.equal(durationInSeconds, 2);
  assert.equal(thumb.type, "image/jpeg");
  assert.equal(jpeg[0], 0xff);
  assert.equal(jpeg[1], 0xd8);
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
  const file = new File([await readFile(videoPath)], "silent.mp4", { type: "video/mp4" });
  const video = createFfmpegVideo();

  await assert.rejects(
    () => video.extract(file),
    /ffmpeg exited with [\s\S]*(does not contain any stream|Stream map)/i,
  );
});
