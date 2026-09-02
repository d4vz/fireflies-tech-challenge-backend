import { spawn } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";
import type { Video } from "../index.ts";

function failMessage(command: string, code: number | null, stderr: string) {
  const detail = stderr.trim();
  if (detail.length === 0) {
    return `${command} exited with ${code}`;
  }
  return `${command} exited with ${code}: ${detail}`;
}

function run(command: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }
      reject(new Error(failMessage(command, code, stderr)));
    });
  });
}

function beside(inputPath: string, name: string) {
  return path.join(path.dirname(inputPath), name);
}

function parseSeconds(output: string) {
  const seconds = Number(output.trim());
  if (Number.isFinite(seconds)) {
    return seconds;
  }
  return undefined;
}

function lastPacketEnd(output: string) {
  const lines = output.trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    const [pts, duration] = lines[i].split(",");
    const start = Number(pts);
    if (!Number.isFinite(start)) {
      continue;
    }
    const length = Number(duration);
    return Number.isFinite(length) ? start + length : start;
  }
  return undefined;
}

async function formatDuration(inputPath: string) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "default=noprint_wrappers=1:nokey=1",
    inputPath,
  ]);
  return parseSeconds(output);
}

async function packetDuration(inputPath: string) {
  const output = await run("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "packet=pts_time,duration_time",
    "-of",
    "csv=p=0",
    inputPath,
  ]);
  return lastPacketEnd(output);
}

export function createFfmpegVideo(): Video {
  return {
    extract: async (inputPath) => {
      const outputPath = beside(inputPath, "audio.mp3");
      await run("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-vn",
        "-acodec",
        "libmp3lame",
        "-q:a",
        "4",
        outputPath,
      ]);
      return outputPath;
    },
    durationInSeconds: async (inputPath) => {
      const seconds = (await formatDuration(inputPath)) ?? (await packetDuration(inputPath));
      if (seconds === undefined) {
        throw new Error("ffprobe did not return a duration: N/A");
      }
      return Math.round(seconds);
    },
    thumbnail: async (inputPath) => {
      const outputPath = beside(inputPath, "thumb.jpg");
      await run("ffmpeg", [
        "-y",
        "-i",
        inputPath,
        "-ss",
        "0",
        "-frames:v",
        "1",
        "-q:v",
        "2",
        outputPath,
      ]);
      const image = await readFile(outputPath);
      return new File([image], "thumb.jpg", { type: "image/jpeg" });
    },
  };
}
