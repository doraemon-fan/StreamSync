import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";

const app = express();
const PORT = 3000;
const HLS_OUTPUT_DIR = "/hls";

// --- NEW CODE: Serve the test frontend ---
app.use(express.static("public"));
// ----------------------------------------

app.post("/stream", (req, res) => {
  const roomId = (req.query.roomId as string) || "default-room";
  console.log(`[Stream] Incoming connection for Room ${roomId}`);

  const roomDir = path.join(HLS_OUTPUT_DIR, roomId);
  if (!fs.existsSync(roomDir)) fs.mkdirSync(roomDir, { recursive: true });

  // FFmpeg setup (Same as before)
  // ffmpeg/src/server.ts

  // ... inside app.post('/stream', ...)

  const ffmpeg = spawn("ffmpeg", [
    // 1. ADD THESE TWO LINES (Increase buffer to 100MB before guessing)
    "-re", // Optional: Read input at native frame rate (good for streaming)
    "-analyzeduration",
    "25000000", // Read up to 100MB or 100 seconds to find header
    "-probesize",
    "25000000", // Probe more data to detect format correctly
    '-f', 'webm',
    "-i",
    "pipe:0", // Input from the pipe

    // ... rest of your flags
    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "5",
    "-hls_flags",
    "delete_segments",
    path.join(roomDir, "index.m3u8"),
  ]);

  req.pipe(ffmpeg.stdin);

  ffmpeg.stderr.on("data", (d) => console.log(`[FFmpeg]: ${d}`));

  req.on("close", () => {
    if (!ffmpeg.killed) ffmpeg.stdin.end();
  });

  ffmpeg.on("close", (code) => {
    console.log(`Stream ended with code ${code}`);
    // Optional: Don't delete immediately if you want to inspect files manually
    // fs.rmSync(roomDir, { recursive: true, force: true });
  });

  res.status(200).send("Streaming Started");
});

app.listen(PORT, () =>
  console.log(`FFmpeg Service running on http://localhost:${PORT}`),
);
