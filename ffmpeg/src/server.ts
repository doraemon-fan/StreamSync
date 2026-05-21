import express from "express";
import { spawn } from "child_process";
import fs from "fs";
import path from "path";
import multer from "multer";

const app = express();
const PORT = 3000;
const HLS_DIR = "/hls";
const TEMP_DIR = "/temp";

app.use(express.json());
app.use(express.static("public"));

const upload = multer({ storage: multer.memoryStorage() });

const uploadSessions: Record<
  string,
  {
    totalChunk: number;
    receivedChunks: number;
    fileName: string;
  }
> = {};

//START

app.post("/upload/start", (req, res) => {
  const { roomId, totalChunk, fileName } = req.body;

  const roomHLS = path.join(HLS_DIR, roomId);
  const roomTemp = path.join(TEMP_DIR, roomId);
  if (!fs.existsSync(roomHLS)) fs.mkdirSync(roomHLS, { recursive: true });
  if (!fs.existsSync(roomTemp)) fs.mkdirSync(roomTemp, { recursive: true });

  //Room Cleanup
  const tempFile = path.join(roomTemp, "upload.tmp");
  if (fs.existsSync(tempFile)) fs.rmSync(tempFile);

  uploadSessions[roomId] = { totalChunk, receivedChunks: 0, fileName };

  console.log(`[Start] Room: ${roomId} | Chunks expected: ${totalChunk}`);
  app.post("/upload/chunk", upload.single("chunk"), (req, res) => {
    const { roomId, chunkIndex, totalChunks } = req.body;
    const chunk = req.file?.buffer;

    if (!chunk) return res.status(400).json({ error: "no chunk" });

    const tempFile = path.join(TEMP_DIR, roomId, "upload.tmp");

    // append chunk to temp file — this is how we reassemble
    fs.appendFileSync(tempFile, chunk);

    uploadSessions[roomId].receivedChunks++;
    console.log(`[Chunk] Room: ${roomId} | ${chunkIndex}/${totalChunks}`);

    res.json({ ok: true });
  });
  res.json({ ok: true });
});

//CHUNK
app.post("/upload/chunk", upload.single("chunk"), (req, res) => {
  const { roomId, chunkIndex, totalChunks } = req.body;
  const chunk = req.file?.buffer;

  if (!chunk) return res.status(400).json({ error: "no chunk" });

  const tempFile = path.join(TEMP_DIR, roomId, "upload.tmp");

  fs.appendFileSync(tempFile, chunk);

  uploadSessions[roomId].receivedChunks++;
  console.log(`[Chunk] Room: ${roomId} | ${chunkIndex}/${totalChunks}`);

  res.json({ ok: true });
});

//COMPLETE
app.post("/upload/complete", (req, res) => {
  const { roomId } = req.body;
  const session = uploadSessions[roomId];

  if (!session) return res.status(400).json({ error: "no session found" });

  console.log(`[Complete] Room: ${roomId} — starting FFmpeg`);
  res.json({ ok: true }); // respond immediately, FFmpeg runs in background

  const tempFile = path.join(TEMP_DIR, roomId, "upload.tmp");
  const roomHLS = path.join(HLS_DIR, roomId);

  runFFmpeg(tempFile, roomHLS, roomId);
});

//FFMPEG LOGIC
function runFFmpeg(inputFile: string, outputDir: string, roomId: string) {
  const ffmpeg = spawn("ffmpeg", [
    "-i",
    inputFile,

    "-c:v",
    "libx264",
    "-preset",
    "ultrafast",
    "-tune",
    "zerolatency",
    "-c:a",
    "aac",

    "-f",
    "hls",
    "-hls_time",
    "2",
    "-hls_list_size",
    "0",
    "-hls_flags",
    "independent_segments",
    "-hls_segment_type",
    "mpegts",

    path.join(outputDir, "index.m3u8"),
  ]);

  ffmpeg.stderr.on("data", (d) => process.stdout.write(`[FFmpeg] ${d}`));

  ffmpeg.on("close", (code) => {
    console.log(`[FFmpeg] Done for room: ${roomId} — exit code: ${code}`);
    fs.rmSync(path.join(TEMP_DIR, roomId), { recursive: true, force: true });
    delete uploadSessions[roomId];
  });

  ffmpeg.on("error", (err) => {
    console.error(`[FFmpeg] Failed to start: ${err.message}`);
  });
}

//SERVE HLS

app.use("/hls", express.static(HLS_DIR));

app.listen(PORT, () => {
  console.log(`FFmpeg service running on PORT :${PORT}`);
  console.log(`http://localhost:${PORT}`);
});
