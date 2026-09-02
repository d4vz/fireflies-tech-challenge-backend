import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { mkdtemp, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { finished } from "node:stream/promises";
import { test } from "node:test";
import { loadSettings, settingsFileUrl } from "../../config/index.ts";
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

async function runStdoutToFile(command: string, args: string[], outputPath: string) {
  const child = spawn(command, args);
  const out = createWriteStream(outputPath);
  child.stdout.pipe(out);
  await Promise.all([
    finished(out),
    new Promise<void>((resolve, reject) => {
      child.on("error", reject);
      child.on("close", (code) => {
        if (code === 0) {
          resolve();
          return;
        }
        reject(new Error(`${command} exited with ${code}`));
      });
    }),
  ]);
}

async function writeSample(dir: string) {
  const samplePath = path.join(dir, "sample.mp4");
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "testsrc=duration=2:size=320x240:rate=10",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=2",
    "-pix_fmt",
    "yuv420p",
    "-shortest",
    samplePath,
  ]);
  return samplePath;
}

async function convertSample(samplePath: string, destPath: string) {
  const ext = path.extname(destPath).slice(1);
  if (ext === "webm") {
    await run("ffmpeg", [
      "-y",
      "-i",
      samplePath,
      "-c:v",
      "libvpx",
      "-deadline",
      "realtime",
      "-c:a",
      "libvorbis",
      destPath,
    ]);
    return;
  }
  await run("ffmpeg", ["-y", "-i", samplePath, "-c", "copy", destPath]);
}

const settings = await loadSettings(settingsFileUrl);

function audioCodecArgs(ext: string): string[] {
  switch (ext) {
    case "mp3":
      return ["-c:a", "libmp3lame"];
    case "wav":
      return ["-c:a", "pcm_s16le"];
    case "m4a":
      return ["-c:a", "aac"];
    case "aac":
      return ["-c:a", "aac", "-f", "adts"];
    case "ogg":
      return ["-c:a", "libvorbis"];
    case "flac":
      return ["-c:a", "flac"];
    default:
      throw new Error(`unsupported audio fixture .${ext}`);
  }
}

async function writeAudioSample(dir: string, ext: string) {
  const dest = path.join(dir, `clip.${ext}`);
  await run("ffmpeg", [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=1000:duration=2",
    ...audioCodecArgs(ext),
    dest,
  ]);
  return dest;
}

for (const ext of settings.upload.video.extensions) {
  test(`ffmpeg reports duration, thumbnail, and audio for .${ext}`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
    const samplePath = await writeSample(dir);
    const videoPath = path.join(dir, `clip.${ext}`);
    await convertSample(samplePath, videoPath);
    const video = createFfmpegVideo();

    const durationInSeconds = await video.durationInSeconds(videoPath);
    const thumb = await video.thumbnail(videoPath);
    const jpeg = new Uint8Array(await thumb.arrayBuffer());
    const audioPath = await video.extract(videoPath);
    const info = await stat(audioPath);

    assert.equal(durationInSeconds, 2);
    assert.equal(thumb.type, "image/jpeg");
    assert.equal(jpeg[0], 0xff);
    assert.equal(jpeg[1], 0xd8);
    assert.equal(audioPath, path.join(dir, "audio.mp3"));
    assert.ok(info.size > 0);
  });
}

for (const ext of settings.upload.audio.extensions) {
  test(`ffmpeg reports duration and extract for audio .${ext}`, async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
    const audioPath = await writeAudioSample(dir, ext);
    const video = createFfmpegVideo();

    const durationInSeconds = await video.durationInSeconds(audioPath);
    const extracted = await video.extract(audioPath);
    const info = await stat(extracted);

    assert.equal(durationInSeconds, 2);
    assert.equal(extracted, path.join(dir, "audio.mp3"));
    assert.ok(info.size > 0);
  });
}

test("ffmpeg reports duration for a webm with no format duration", async () => {
  const dir = await mkdtemp(path.join(tmpdir(), "clip-"));
  const videoPath = path.join(dir, "piped.webm");
  await runStdoutToFile(
    "ffmpeg",
    [
      "-f",
      "lavfi",
      "-i",
      "testsrc=duration=2:size=320x240:rate=10",
      "-c:v",
      "libvpx",
      "-deadline",
      "realtime",
      "-f",
      "webm",
      "pipe:1",
    ],
    videoPath,
  );
  const video = createFfmpegVideo();

  const durationInSeconds = await video.durationInSeconds(videoPath);

  assert.equal(durationInSeconds, 2);
});

test("ffmpeg extract fails with a short message when the clip has no audio", async () => {
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

  await assert.rejects(() => video.extract(videoPath), { message: "Could not extract audio" });
});
