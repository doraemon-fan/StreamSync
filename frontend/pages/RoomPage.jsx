// frontend/pages/RoomPage.jsx
import { useState, useEffect, useRef } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { io } from "socket.io-client";
import Hls from "hls.js";

const BACKEND_URL = "http://localhost:5000";
const FFMPEG_URL = "http://localhost:4000";
const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB

export default function RoomPage() {
  const { roomId } = useParams();
  const [searchParams] = useSearchParams();
  const name = searchParams.get("name") || "guest";
  const role = searchParams.get("role") || "member";
  const isAdmin = role === "admin";

  // state
  const [status, setStatus] = useState("Connecting...");
  const [members, setMembers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);

  // refs
  const videoRef = useRef(null);
  const socketRef = useRef(null);
  const isSyncing = useRef(false);
  const hlsRef = useRef(null);

  // ── SOCKET SETUP ───────────────────────────────────────────────
  useEffect(() => {
    const socket = io(BACKEND_URL);
    socketRef.current = socket;

    socket.on("connect", () => {
      socket.emit("join-room", { roomId, memberName: name });
      setStatus("Joined room — waiting for stream");
    });

    // stream ready event
    socket.on("stream-ready", () => {
      setIsReady(true);
      setStatus("Stream ready — loading player");
      loadPlayer();
    });

    // sync events
    socket.on("play", ({ timestamp }) => {
      if (!videoRef.current) return;
      isSyncing.current = true;
      videoRef.current.currentTime = timestamp;
      videoRef.current.play().finally(() => {
        isSyncing.current = false;
      });
      setStatus("▶ playing");
    });

    socket.on("pause", ({ timestamp }) => {
      if (!videoRef.current) return;
      isSyncing.current = true;
      videoRef.current.currentTime = timestamp;
      videoRef.current.pause();
      isSyncing.current = false;
      setStatus("⏸ paused");
    });

    socket.on("seek", ({ timestamp }) => {
      if (!videoRef.current) return;
      isSyncing.current = true;
      videoRef.current.currentTime = timestamp;
      isSyncing.current = false;
    });

    // late joiner sync
    socket.on("sync-state", ({ isPlaying, timestamp }) => {
      if (!videoRef.current) return;
      isSyncing.current = true;
      videoRef.current.currentTime = timestamp;
      if (isPlaying) {
        videoRef.current.play().finally(() => {
          isSyncing.current = false;
        });
      } else {
        videoRef.current.pause();
        isSyncing.current = false;
      }
      setIsReady(true);
      loadPlayer();
    });

    socket.on("member-joined", ({ memberName }) => {
      setMembers((prev) => [...prev, memberName]);
      setStatus(`${memberName} joined`);
    });

    socket.on("member-left", () => {
      setStatus("someone left");
    });

    // check if stream already ready
    fetch(`${BACKEND_URL}/room/${roomId}`)
      .then((r) => r.json())
      .then((data) => {
        if (data.room?.isReady) {
          setIsReady(true);
          setStatus("Stream ready");
          setTimeout(() => loadPlayer(), 500);
        }
      });

    return () => socket.disconnect();
  }, [roomId]);

  // ── LOAD HLS PLAYER ────────────────────────────────────────────
  function loadPlayer() {
    if (!videoRef.current) {
      setTimeout(() => loadPlayer(), 300);
      return;
    }
    const hlsUrl = `${FFMPEG_URL}/hls/${roomId}/index.m3u8`;

    if (hlsRef.current) {
      hlsRef.current.destroy();
    }

    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3 });
      hlsRef.current = hls;
      hls.loadSource(hlsUrl);
      hls.attachMedia(videoRef.current);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        setStatus("Stream ready");
      });
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus("Waiting for stream...");
          setTimeout(() => hls.loadSource(hlsUrl), 3000);
        }
      });
    } else if (videoRef.current.canPlayType("application/vnd.apple.mpegurl")) {
      videoRef.current.src = hlsUrl;
    }
  }

  // ── VIDEO EVENT HANDLERS ────────────────────────────────────────
  function handlePlay() {
    if (isSyncing.current || !socketRef.current) return;
    socketRef.current.emit("play", {
      roomId,
      timestamp: videoRef.current.currentTime,
    });
  }

  function handlePause() {
    if (isSyncing.current || !socketRef.current) return;
    socketRef.current.emit("pause", {
      roomId,
      timestamp: videoRef.current.currentTime,
    });
  }

  function handleSeeked() {
    if (isSyncing.current || !socketRef.current) return;
    socketRef.current.emit("seek", {
      roomId,
      timestamp: videoRef.current.currentTime,
    });
  }

  // ── UPLOAD ─────────────────────────────────────────────────────
  async function handleUpload(file) {
    if (!file) return;
    setUploading(true);
    setProgress(0);
    setStatus("Starting upload...");

    const totalChunk = Math.ceil(file.size / CHUNK_SIZE);

    // 1. start
    await fetch(`${FFMPEG_URL}/upload/start`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId, totalChunk, fileName: file.name }),
    });

    // 2. chunks
    for (let i = 0; i < totalChunk; i++) {
      const chunk = file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
      const form = new FormData();
      form.append("roomId", roomId);
      form.append("chunkIndex", String(i));
      form.append("totalChunk", String(totalChunk));
      form.append("chunk", chunk);
      await fetch(`${FFMPEG_URL}/upload/chunk`, { method: "POST", body: form });

      const pct = Math.round(((i + 1) / totalChunk) * 100);
      setProgress(pct);
      setStatus(`Uploading... ${pct}%`);
    }

    // 3. complete
    await fetch(`${FFMPEG_URL}/upload/complete`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roomId }),
    });

    setUploading(false);
    setStatus("Processing video...");
    const poll = setInterval(() => {
      fetch(`${BACKEND_URL}/room/${roomId}`)
        .then((r) => r.json())
        .then((data) => {
          if (data.room?.isReady) {
            clearInterval(poll);
            setIsReady(true);
            loadPlayer();
          }
        });
    }, 2000);
  }

  // ── RENDER ─────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col">
      {/* HEADER */}
      <header className="flex items-center justify-between px-6 py-4 border-b border-gray-800">
        <div>
          <h1 className="text-lg font-semibold">StreamSync</h1>
          <p className="text-xs text-gray-400">Room: {roomId}</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400">
            {isAdmin ? "👑 admin" : "👤 member"} — {name}
          </span>
          <button
            onClick={() => navigator.clipboard.writeText(roomId)}
            className="text-xs bg-gray-800 hover:bg-gray-700 px-3 py-1 rounded-lg transition"
          >
            Copy Room ID
          </button>
        </div>
      </header>

      <div className="flex flex-1 gap-0">
        {/* MAIN — VIDEO */}
        <div className="flex-1 flex flex-col p-6 gap-4">
          {/* VIDEO PLAYER */}
          <div className="w-full bg-black rounded-xl overflow-hidden aspect-video">
            <video
              ref={videoRef}
              controls
              className="w-full h-full"
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeeked}
            />
          </div>

          {/* STATUS */}
          <p className="text-sm text-gray-400">{status}</p>

          {/* UPLOAD — admin only */}
          {isAdmin && !isReady && (
            <div className="bg-gray-900 rounded-xl p-4 flex flex-col gap-3">
              <h3 className="text-sm font-medium">Upload Video</h3>
              <input
                type="file"
                accept="video/*"
                onChange={(e) => handleUpload(e.target.files[0])}
                disabled={uploading}
                className="text-sm text-gray-400 file:mr-3 file:py-1 file:px-3 file:rounded-lg file:border-0 file:bg-blue-600 file:text-white file:text-sm hover:file:bg-blue-500"
              />
              {uploading && (
                <div className="w-full bg-gray-800 rounded-full h-2">
                  <div
                    className="bg-blue-500 h-2 rounded-full transition-all"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDEBAR — MEMBERS */}
        <div className="w-56 border-l border-gray-800 p-4 flex flex-col gap-3">
          <h3 className="text-sm font-semibold text-gray-300">Members</h3>
          <div className="flex flex-col gap-2">
            <div className="text-sm text-yellow-400">
              👑 {name} {isAdmin ? "(you)" : ""}
            </div>
            {members.map((m, i) => (
              <div key={i} className="text-sm text-gray-300">
                👤 {m}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
