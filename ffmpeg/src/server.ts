import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { PassThrough } from 'stream';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// Use disk storage instead of memory storage to avoid OOM on large files
const TEMP_DIR = path.join(__dirname, '..', 'temp');
const HLS_DIR = '/hls';

if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
if (!fs.existsSync(HLS_DIR)) fs.mkdirSync(HLS_DIR, { recursive: true });

const storage = multer.diskStorage({
    destination: (req, _file, cb) => {
        const roomId = req.body.roomId;
        const dir = path.join(TEMP_DIR, roomId || 'unknown');
        if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, _file, cb) => {
        cb(null, `chunk_${Date.now()}`);
    },
});
const upload = multer({ storage });

// ─── Session tracking ──────────────────────────────
interface TranscodeSession {
    totalChunk: number;
    received: Set<number>;
    fileName: string;
    inputStream: PassThrough;
    ffmpegProcess: ChildProcess;
    hlsDir: string;
    notifiedReady: boolean;
    nextExpectedChunk: number;
    pendingChunks: Map<number, Buffer>;
    watcher: fs.FSWatcher | null;
}

const sessions: Record<string, TranscodeSession> = {};

// Backend URL for notifications
const BACKEND_URL = process.env.BACKEND_URL || 'http://streamsync-backend:5000';

// ─── Upload Start ──────────────────────────────
// Spawns FFmpeg immediately — it reads from a PassThrough stream (stdin pipe)
// and starts producing HLS segments as soon as it has enough data (~4s of video)
app.post('/upload/start', (req, res): void => {
    const { roomId, totalChunk, fileName } = req.body;
    if (!roomId || !totalChunk || !fileName) {
        res.status(400).json({ error: 'roomId, totalChunk, fileName required' });
        return;
    }

    // Clean up any previous session for this room
    if (sessions[roomId]) {
        try {
            sessions[roomId].inputStream.destroy();
            sessions[roomId].ffmpegProcess.kill('SIGKILL');
            if (sessions[roomId].watcher) sessions[roomId].watcher!.close();
        } catch {}
        delete sessions[roomId];
    }

    // Create HLS output directory
    const hlsDir = path.join(HLS_DIR, roomId);
    if (!fs.existsSync(hlsDir)) fs.mkdirSync(hlsDir, { recursive: true });

    // Create the PassThrough stream that FFmpeg will read from
    const inputStream = new PassThrough({
        highWaterMark: 4 * 1024 * 1024, // 4MB buffer
    });

    // Spawn FFmpeg reading from stdin, outputting HLS segments
    const ffmpegProcess = spawn('ffmpeg', [
        '-y',
        '-i', 'pipe:0',                          // Read from stdin
        '-c:v', 'libx264',
        '-preset', 'ultrafast',                   // Fast encoding for real-time
        '-tune', 'zerolatency',                   // Minimize latency
        '-c:a', 'aac',
        '-b:a', '128k',
        '-f', 'hls',
        '-hls_time', '4',                         // 4-second segments for fast start
        '-hls_list_size', '0',                    // Keep all segments in playlist
        '-hls_flags', 'append_list+independent_segments',
        '-hls_segment_filename', path.join(hlsDir, 'segment_%03d.ts'),
        path.join(hlsDir, 'index.m3u8'),
    ], {
        stdio: ['pipe', 'pipe', 'pipe'],
    });

    // Pipe our PassThrough stream into FFmpeg's stdin
    inputStream.pipe(ffmpegProcess.stdin!);

    // Handle FFmpeg stderr for progress tracking
    let lastProgressNotify = 0;
    ffmpegProcess.stderr!.on('data', (data: Buffer) => {
        const line = data.toString();
        // Parse FFmpeg progress output
        const timeMatch = line.match(/time=(\d{2}):(\d{2}):(\d{2}\.\d{2})/);
        const fpsMatch = line.match(/fps=\s*(\d+)/);
        const speedMatch = line.match(/speed=\s*([\d.]+)x/);

        if (timeMatch) {
            const hours = parseInt(timeMatch[1]);
            const mins = parseInt(timeMatch[2]);
            const secs = parseFloat(timeMatch[3]);
            const totalSecs = hours * 3600 + mins * 60 + secs;

            const now = Date.now();
            // Throttle progress notifications to every 2 seconds
            if (now - lastProgressNotify > 2000) {
                lastProgressNotify = now;
                fetch(`${BACKEND_URL}/room/transcode-progress`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        roomId,
                        totalSecs,
                        fps: fpsMatch ? parseInt(fpsMatch[1]) : null,
                        speed: speedMatch ? parseFloat(speedMatch[1]) : null,
                    }),
                }).catch(() => {}); // Ignore notification errors
            }
        }
    });

    // Watch for first HLS segment to notify "stream-ready"
    let watcher: fs.FSWatcher | null = null;
    try {
        watcher = fs.watch(hlsDir, (eventType, filename) => {
            if (filename && filename.endsWith('.m3u8') && !sessions[roomId]?.notifiedReady) {
                // Check if the m3u8 file actually has segment references
                try {
                    const content = fs.readFileSync(path.join(hlsDir, filename), 'utf-8');
                    if (content.includes('.ts')) {
                        if (sessions[roomId]) {
                            sessions[roomId].notifiedReady = true;
                        }
                        console.log(`First segment ready for room ${roomId}, notifying backend`);
                        fetch(`${BACKEND_URL}/room/ready`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ roomId }),
                        }).catch(err => console.error('Failed to notify backend:', err));

                        if (watcher) {
                            watcher.close();
                            watcher = null;
                        }
                    }
                } catch {}
            }
        });
    } catch (err) {
        console.error('Failed to watch HLS directory:', err);
    }

    ffmpegProcess.on('close', (code) => {
        console.log(`FFmpeg exited with code ${code} for room ${roomId}`);

        // If we never notified ready (e.g., very short video), notify now
        if (sessions[roomId] && !sessions[roomId].notifiedReady && code === 0) {
            sessions[roomId].notifiedReady = true;
            fetch(`${BACKEND_URL}/room/ready`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ roomId }),
            }).catch(err => console.error('Failed to notify backend:', err));
        }

        // Clean up temp directory
        const roomTempDir = path.join(TEMP_DIR, roomId);
        if (fs.existsSync(roomTempDir)) {
            fs.rmSync(roomTempDir, { recursive: true, force: true });
        }

        // Clean up watcher
        if (sessions[roomId]?.watcher) {
            sessions[roomId].watcher!.close();
        }

        // Clean up session
        delete sessions[roomId];
    });

    ffmpegProcess.on('error', (err) => {
        console.error(`FFmpeg process error for room ${roomId}:`, err);
        // Clean up
        const roomTempDir = path.join(TEMP_DIR, roomId);
        if (fs.existsSync(roomTempDir)) {
            fs.rmSync(roomTempDir, { recursive: true, force: true });
        }
        if (sessions[roomId]?.watcher) {
            sessions[roomId].watcher!.close();
        }
        delete sessions[roomId];
    });

    sessions[roomId] = {
        totalChunk: Number(totalChunk),
        received: new Set(),
        fileName,
        inputStream,
        ffmpegProcess,
        hlsDir,
        notifiedReady: false,
        nextExpectedChunk: 0,
        pendingChunks: new Map(),
        watcher,
    };

    console.log(`Upload started for room ${roomId}: ${totalChunk} chunks, FFmpeg spawned`);
    res.json({ ok: true });
});

// ─── Upload Chunk ──────────────────────────────
// Each chunk is written to FFmpeg's stdin pipe in order.
// Out-of-order chunks are buffered and flushed when the expected chunk arrives.
app.post('/upload/chunk', upload.single('chunk'), (req, res): void => {
    const { roomId, chunkIndex } = req.body;
    const file = req.file;

    if (!roomId || chunkIndex === undefined || !file) {
        res.status(400).json({ error: 'roomId, chunkIndex, chunk required' });
        return;
    }

    const session = sessions[roomId];
    if (!session) {
        res.status(400).json({ error: 'No active session for this room. Call /upload/start first.' });
        return;
    }

    const idx = Number(chunkIndex);
    session.received.add(idx);

    // Read chunk from disk (multer disk storage wrote it)
    const chunkData = fs.readFileSync(file.path);
    // Delete the temp chunk file immediately
    try { fs.unlinkSync(file.path); } catch {}

    if (idx === session.nextExpectedChunk) {
        // This is the next expected chunk — write it and flush any buffered ones
        session.inputStream.write(chunkData);
        session.nextExpectedChunk++;

        // Flush any pending chunks that are now in order
        while (session.pendingChunks.has(session.nextExpectedChunk)) {
            const pending = session.pendingChunks.get(session.nextExpectedChunk)!;
            session.inputStream.write(pending);
            session.pendingChunks.delete(session.nextExpectedChunk);
            session.nextExpectedChunk++;
        }
    } else {
        // Out of order — buffer it
        session.pendingChunks.set(idx, chunkData);
    }

    res.json({ ok: true, received: session.received.size, total: session.totalChunk });
});

// ─── Upload Complete ───────────────────────────
// Close the stdin pipe — FFmpeg will finish processing remaining data and exit
app.post('/upload/complete', (req, res): void => {
    const { roomId } = req.body;
    const session = sessions[roomId];

    if (!session) {
        res.status(400).json({ error: 'No upload session found' });
        return;
    }

    // Flush any remaining pending chunks
    while (session.pendingChunks.has(session.nextExpectedChunk)) {
        const pending = session.pendingChunks.get(session.nextExpectedChunk)!;
        session.inputStream.write(pending);
        session.pendingChunks.delete(session.nextExpectedChunk);
        session.nextExpectedChunk++;
    }

    // End the input stream — signals EOF to FFmpeg
    session.inputStream.end();

    console.log(`Upload complete for room ${roomId}. FFmpeg will finish transcoding remaining data.`);
    res.json({ ok: true, message: 'Upload complete. Transcoding will finish shortly.' });
});

// ─── Health check ──────────────────────────────
app.get('/health', (_req, res) => {
    res.json({
        status: 'ok',
        activeSessions: Object.keys(sessions).length,
    });
});

const PORT = 3000;
app.listen(PORT, () => {
    console.log(`FFmpeg service on port ${PORT}`);
});
