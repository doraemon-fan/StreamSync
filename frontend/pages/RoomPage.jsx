import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { BACKEND_URL, FFMPEG_URL } from '../src/config';
import { io as socketIO } from 'socket.io-client';
import Hls from 'hls.js';
import '../src/styles/RoomPage.css';

const CHUNK_SIZE = 2 * 1024 * 1024; // 2MB
const HLS_BASE = import.meta.env.VITE_HLS_URL || 'http://localhost:8080';

export default function RoomPage() {
  const { roomId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const memberName = params.get('name');
  const role = params.get('role') || 'member';

  // Redirect if missing params
  useEffect(() => {
    if (!memberName || !roomId) navigate('/');
  }, [memberName, roomId, navigate]);

  // ─── State ──────────────────────────────────
  const [members, setMembers] = useState([]);
  const [isReady, setIsReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null); // null | { percent, status }
  const [transcodingInfo, setTranscodingInfo] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);

  // ─── Refs ───────────────────────────────────
  const socketRef = useRef(null);
  const hlsRef = useRef(null);
  const videoRef = useRef(null);
  const ignoreEventsRef = useRef(0); // counter-based guard vs setTimeout
  const fileInputRef = useRef(null);

  // ─── Socket Setup ──────────────────────────
  useEffect(() => {
    if (!memberName || !roomId) return;

    const socket = socketIO(BACKEND_URL, { transports: ['websocket'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      setConnected(true);
      socket.emit('join-room', { roomId, memberName });
    });

    socket.on('disconnect', () => setConnected(false));

    // Sync state from server on join
    socket.on('sync-state', ({ isPlaying, timestamp, isReady: ready }) => {
      setIsReady(ready);
      const vid = videoRef.current;
      if (vid && ready) {
        vid.currentTime = timestamp;
        if (isPlaying) vid.play().catch(() => {});
      }
    });

    // Stream ready — start HLS
    socket.on('stream-ready', () => {
      setIsReady(true);
      loadHls();
    });

    // Playback sync
    function handlePlay({ timestamp }) {
      const vid = videoRef.current;
      if (!vid) return;
      ignoreEventsRef.current++;
      vid.currentTime = timestamp;
      vid.play().catch(() => {});
      setTimeout(() => { ignoreEventsRef.current = Math.max(0, ignoreEventsRef.current - 1); }, 300);
    }
    function handlePause({ timestamp }) {
      const vid = videoRef.current;
      if (!vid) return;
      ignoreEventsRef.current++;
      vid.currentTime = timestamp;
      vid.pause();
      setTimeout(() => { ignoreEventsRef.current = Math.max(0, ignoreEventsRef.current - 1); }, 300);
    }
    function handleSeek({ timestamp }) {
      const vid = videoRef.current;
      if (!vid) return;
      ignoreEventsRef.current++;
      vid.currentTime = timestamp;
      setTimeout(() => { ignoreEventsRef.current = Math.max(0, ignoreEventsRef.current - 1); }, 300);
    }

    socket.on('play', handlePlay);
    socket.on('pause', handlePause);
    socket.on('seek', handleSeek);

    // Members
    socket.on('member-joined', ({ members: m }) => setMembers(m));
    socket.on('member-left', ({ members: m }) => setMembers(m));

    // Transcode progress
    socket.on('transcode-progress', ({ totalSecs, fps, speed }) => {
      setTranscodingInfo({ totalSecs: Math.round(totalSecs), fps, speed });
    });

    socket.on('room-deleted', () => navigate('/'));

    return () => {
      socket.off('connect');
      socket.off('disconnect');
      socket.off('sync-state');
      socket.off('stream-ready');
      socket.off('play', handlePlay);
      socket.off('pause', handlePause);
      socket.off('seek', handleSeek);
      socket.off('member-joined');
      socket.off('member-left');
      socket.off('transcode-progress');
      socket.off('room-deleted');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, memberName]);

  // ─── HLS Setup ────────────────────────────
  const loadHls = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) return;

    // Destroy previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const hlsUrl = `${HLS_BASE}/hls/${roomId}/index.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        liveSyncDurationCount: 3,
        liveMaxLatencyDurationCount: 6,
        enableWorker: true,
        lowLatencyMode: true,
        manifestLoadPolicy: {
          default: { maxTimeToFirstByteMs: 10000, maxLoadTimeMs: 20000, timeoutRetry: { maxNumRetry: 4, retryDelayMs: 500, maxRetryDelayMs: 2000 }, errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 4000 } }
        },
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(vid);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        vid.play().catch(() => {});
      });
      hlsRef.current = hls;
    } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      // Native HLS (Safari)
      vid.src = hlsUrl;
      vid.addEventListener('loadedmetadata', () => vid.play().catch(() => {}));
    }
  }, [roomId]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    };
  }, []);

  // ─── Video Events → Socket ────────────────
  const onPlay = () => {
    if (ignoreEventsRef.current > 0) return;
    socketRef.current?.emit('play', { roomId, timestamp: videoRef.current.currentTime });
  };
  const onPause = () => {
    if (ignoreEventsRef.current > 0) return;
    socketRef.current?.emit('pause', { roomId, timestamp: videoRef.current.currentTime });
  };
  const onSeeked = () => {
    if (ignoreEventsRef.current > 0) return;
    socketRef.current?.emit('seek', { roomId, timestamp: videoRef.current.currentTime });
  };

  // ─── File Upload ──────────────────────────
  const handleFileSelect = async (file) => {
    if (!file) return;

    const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
    setUploadProgress({ percent: 0, status: 'Starting upload...' });

    try {
      // Start the transcode session
      await fetch(`${FFMPEG_URL}/upload/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, totalChunk: totalChunks, fileName: file.name }),
      });

      // Upload chunks
      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${i}`);
        formData.append('roomId', roomId);
        formData.append('chunkIndex', i.toString());

        // Retry up to 3 times per chunk
        let success = false;
        for (let attempt = 0; attempt < 3 && !success; attempt++) {
          try {
            const res = await fetch(`${FFMPEG_URL}/upload/chunk`, { method: 'POST', body: formData });
            if (res.ok) success = true;
          } catch {
            if (attempt === 2) throw new Error(`Failed to upload chunk ${i}`);
            await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
          }
        }

        const percent = Math.round(((i + 1) / totalChunks) * 100);
        setUploadProgress({
          percent,
          status: percent === 100 ? 'Processing...' : `Uploading: ${percent}%`,
        });
      }

      // Signal upload complete
      await fetch(`${FFMPEG_URL}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });

      setUploadProgress({ percent: 100, status: 'Transcoding...' });
    } catch (err) {
      setUploadProgress({ percent: 0, status: `Error: ${err.message}` });
    }
  };

  const onFileInputChange = (e) => {
    handleFileSelect(e.target.files?.[0]);
    e.target.value = '';
  };

  // ─── Drag & Drop ──────────────────────────
  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);
  const onDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    handleFileSelect(e.dataTransfer.files?.[0]);
  };

  // ─── Copy Room ID ─────────────────────────
  const copyRoomId = () => {
    navigator.clipboard.writeText(roomId).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  // ─── Render ───────────────────────────────
  if (!memberName) return null;

  return (
    <div className="room-page">
      {/* Header */}
      <header className="room-header">
        <div className="room-header-left">
          <h1 className="room-title">
            <span className="text-gradient">StreamSync</span>
            <button
              className={`room-id-chip ${copied ? 'copied' : ''}`}
              onClick={copyRoomId}
              title="Copy Room ID"
            >
              {copied ? '✓ Copied' : `#${roomId}`}
              {!copied && <span className="copy-icon">📋</span>}
            </button>
          </h1>
          <div className="room-user-info">
            <span className="online-dot" />
            <span>{memberName}</span>
            <span className={`badge ${role === 'admin' ? 'badge-admin' : 'badge-member'}`}>
              {role === 'admin' ? '👑 Admin' : '👤 Member'}
            </span>
          </div>
        </div>

        <div className="room-header-right">
          <div className="viewer-count">
            👥 {members.length || 1} viewer{(members.length || 1) !== 1 ? 's' : ''}
          </div>
          <div className={`connection-status ${connected ? 'connected' : 'disconnected'}`}>
            <span className="online-dot" style={connected ? {} : { background: 'var(--error)', boxShadow: '0 0 6px var(--error)' }} />
            {connected ? 'Connected' : 'Reconnecting...'}
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="room-layout">
        {/* Video / Upload Area */}
        <div className="glass-card video-container">
          {isReady ? (
            <video
              ref={videoRef}
              controls
              onPlay={onPlay}
              onPause={onPause}
              onSeeked={onSeeked}
            />
          ) : uploadProgress ? (
            /* Upload Progress */
            <div className="upload-progress">
              <span className="upload-progress-icon">🔄</span>
              <div className="upload-progress-text">{uploadProgress.status}</div>
              <div className="upload-progress-sub">
                {uploadProgress.percent}% complete
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
              {uploadProgress.percent === 100 && transcodingInfo && (
                <div className="transcoding-status">
                  <span className="transcoding-spinner" />
                  Transcoded {transcodingInfo.totalSecs}s
                  {transcodingInfo.speed && ` at ${transcodingInfo.speed}x`}
                </div>
              )}
            </div>
          ) : role === 'admin' ? (
            /* Upload Dropzone (admin only) */
            <div className="upload-area">
              <div
                className={`upload-dropzone ${dragOver ? 'drag-over' : ''}`}
                onClick={() => fileInputRef.current?.click()}
                onDragOver={onDragOver}
                onDragLeave={onDragLeave}
                onDrop={onDrop}
              >
                <span className="upload-icon">📤</span>
                <div className="upload-title">Drop a video file here</div>
                <div className="upload-hint">or click to browse — MP4, MKV, AVI, MOV</div>
                <button className="btn btn-primary">Select Video</button>
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="video/*"
                onChange={onFileInputChange}
                className="visually-hidden"
              />
            </div>
          ) : (
            /* Waiting (member) */
            <div className="waiting-area">
              <span className="waiting-icon">⏳</span>
              <div className="waiting-title">Waiting for admin to upload a video...</div>
              <div className="waiting-hint">The stream will start automatically</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="glass-card room-sidebar">
          <h3 className="sidebar-title">👥 Members</h3>
          <div className="member-list">
            {(members.length > 0 ? members : [{ name: memberName, role }]).map((m, i) => (
              <div key={m.name + i} className="member-item">
                <div className="member-avatar" style={m.role === 'admin' ? { background: 'var(--gradient-accent)' } : {}}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">{m.name}</div>
                  <span className={`badge ${m.role === 'admin' ? 'badge-admin' : 'badge-member'} member-role`}>
                    {m.role === 'admin' ? '👑 Admin' : '👤 Member'}
                  </span>
                </div>
                <span className="online-dot" />
              </div>
            ))}
          </div>

          {/* Room Info */}
          <div className="room-info-section">
            <h3 className="sidebar-title">ℹ️ Room Info</h3>
            <div className="room-info-item">
              <span className="room-info-label">Status</span>
              <span className="room-info-value">{isReady ? '🟢 Streaming' : '🟡 Waiting'}</span>
            </div>
            <div className="room-info-item">
              <span className="room-info-label">Room ID</span>
              <span className="room-info-value">{roomId}</span>
            </div>
            <div className="room-info-item">
              <span className="room-info-label">Your Role</span>
              <span className="room-info-value">{role === 'admin' ? 'Admin' : 'Member'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
