import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;
const HLS_OUTPUT_DIR = "/hls";

app.use(express.static("public"));

app.post("/stream", (req, res) => {
  const roomId = (req.query.roomId as string) || "default-room";
  console.log(`[Stream] Incoming connection for Room: ${roomId}`);

  const roomDir = path.join(HLS_OUTPUT_DIR, roomId);
  if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });

  const ffmpeg = spawn("ffmpeg", [
    // ❌ REMOVED: "-re"  → was throttling input consumption, causing pipe overflow

    "-analyzeduration", "2000000",   // 2MB is plenty for WebM
    "-probesize",       "2000000",   // was 25MB — no need to buffer that much

    "-f", "webm",
    "-i", "pipe:0",

    "-c:v", "libx264",
    "-preset", "ultrafast",
    "-tune", "zerolatency",

    // Audio: transcode if present, skip if not (prevents crash on video-only input)
    "-c:a", "aac",
    "-strict", "experimental",

    "-f", "hls",
    "-hls_time", "2",
    "-hls_list_size", "5",
    "-hls_flags", "delete_segments+append_list",
    "-hls_segment_type", "mpegts",

    path.join(roomDir, "index.m3u8"),
  ]);

  // ✅ Handle stdin errors — prevents Node crash when FFmpeg dies mid-stream
  ffmpeg.stdin.on("error", (err) => {
    console.warn(`[FFmpeg] stdin error (stream likely ended): ${err.message}`);
  });

  // ✅ Proper backpressure: pause req when ffmpeg.stdin buffer is full
  ffmpeg.stdin.on("drain", () => req.resume());

  req.on("data", (chunk) => {
    const canContinue = ffmpeg.stdin.write(chunk);
    if (!canContinue) req.pause(); // pause until FFmpeg drains
  });

  req.on("end", () => {
    ffmpeg.stdin.end();
    console.log(`[Stream] Client finished sending for room: ${roomId}`);
  });

  req.on("close", () => {
    if (!ffmpeg.killed) {
      ffmpeg.stdin.destroy();
      ffmpeg.kill("SIGTERM");
    }
  });

  ffmpeg.stderr.on("data", (d) => {
    // FFmpeg writes progress to stderr — not always an error
    process.stdout.write(`[FFmpeg] ${d}`);
  });

  ffmpeg.on("close", (code) => {
    console.log(`[FFmpeg] Process exited with code: ${code}`);
  });

  ffmpeg.on("error", (err) => {
    console.error(`[FFmpeg] Failed to start: ${err.message}`);
    if (!res.headersSent) res.status(500).send("FFmpeg failed to start");
  });

  if (!res.headersSent) res.status(200).send("Streaming started");
});

app.listen(PORT, () =>
  console.log(`FFmpeg service running on http://localhost:${PORT}`)
);
