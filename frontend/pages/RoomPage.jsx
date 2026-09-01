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
  const initialRole = params.get('role') || 'member';

  // Redirect if missing params
  useEffect(() => {
    if (!memberName || !roomId) navigate('/');
  }, [memberName, roomId, navigate]);

  // ─── State ──────────────────────────────────
  const [members, setMembers] = useState([]);
  const [myRole, setMyRole] = useState(initialRole);
  const [isReady, setIsReady] = useState(false);
  const [connected, setConnected] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(null);
  const [transcodingInfo, setTranscodingInfo] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hlsError, setHlsError] = useState(null);

  // ─── Refs ───────────────────────────────────
  const socketRef = useRef(null);
  const hlsRef = useRef(null);
  const videoRef = useRef(null);
  const ignoreEventsRef = useRef(0);
  const fileInputRef = useRef(null);
  const hlsRetryTimerRef = useRef(null);

  // ─── HLS Setup (extracted as stable function) ─────
  const loadHls = useCallback(() => {
    const vid = videoRef.current;
    if (!vid) {
      // Video element not mounted yet — retry shortly
      if (hlsRetryTimerRef.current) clearTimeout(hlsRetryTimerRef.current);
      hlsRetryTimerRef.current = setTimeout(() => loadHls(), 200);
      return;
    }

    // Destroy previous instance
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    setHlsError(null);
    const hlsUrl = `${HLS_BASE}/hls/${roomId}/index.m3u8`;

    if (Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: false,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
        startPosition: 0,
        manifestLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15000,
            maxLoadTimeMs: 30000,
            timeoutRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
            errorRetry: { maxNumRetry: 8, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        },
        playlistLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15000,
            maxLoadTimeMs: 30000,
            timeoutRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
            errorRetry: { maxNumRetry: 8, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        },
        fragLoadPolicy: {
          default: {
            maxTimeToFirstByteMs: 15000,
            maxLoadTimeMs: 60000,
            timeoutRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 4000 },
            errorRetry: { maxNumRetry: 6, retryDelayMs: 1000, maxRetryDelayMs: 8000 },
          },
        },
      });
      hls.loadSource(hlsUrl);
      hls.attachMedia(vid);
      hls.on(Hls.Events.MANIFEST_PARSED, () => {
        vid.play().catch(() => {});
      });
      hls.on(Hls.Events.ERROR, (_event, data) => {
        if (data.fatal) {
          console.error('HLS fatal error:', data.type, data.details);
          if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
            setHlsError('Network error loading video. Retrying...');
            setTimeout(() => hls.startLoad(), 3000);
          } else if (data.type === Hls.ErrorTypes.MEDIA_ERROR) {
            setHlsError('Media error. Recovering...');
            hls.recoverMediaError();
          } else {
            setHlsError('Failed to load video. Try refreshing.');
          }
        }
      });
      hlsRef.current = hls;
    } else if (vid.canPlayType('application/vnd.apple.mpegurl')) {
      vid.src = hlsUrl;
      vid.addEventListener('loadedmetadata', () => vid.play().catch(() => {}));
    }
  }, [roomId]);

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
      if (ready) {
        // Use a small delay to let React render the <video> element first
        setTimeout(() => {
          loadHls();
          const vid = videoRef.current;
          if (vid) {
            vid.currentTime = timestamp;
            if (isPlaying) vid.play().catch(() => {});
          }
        }, 100);
      }
    });

    // Stream ready — start HLS
    socket.on('stream-ready', () => {
      setIsReady(true);
      // Small delay so React renders <video> before we try to attach HLS
      setTimeout(() => loadHls(), 100);
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
    socket.on('member-joined', ({ members: m }) => {
      setMembers(m);
      // Update own role if it changed
      const me = m.find(member => member.name === memberName);
      if (me) setMyRole(me.role);
    });
    socket.on('member-left', ({ members: m }) => {
      setMembers(m);
      const me = m.find(member => member.name === memberName);
      if (me) setMyRole(me.role);
    });
    socket.on('members-updated', ({ members: m }) => {
      setMembers(m);
      const me = m.find(member => member.name === memberName);
      if (me) setMyRole(me.role);
    });

    // Kicked
    socket.on('kicked', () => {
      navigate('/');
    });

    // Room reset (admin re-uploads)
    socket.on('room-reset', () => {
      setIsReady(false);
      setUploadProgress(null);
      setTranscodingInfo(null);
      setHlsError(null);
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }
    });

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
      socket.off('members-updated');
      socket.off('kicked');
      socket.off('room-reset');
      socket.off('transcode-progress');
      socket.off('room-deleted');
      socket.disconnect();
      socketRef.current = null;
    };
  }, [roomId, memberName, loadHls, navigate]);

  // Cleanup HLS on unmount
  useEffect(() => {
    return () => {
      if (hlsRetryTimerRef.current) clearTimeout(hlsRetryTimerRef.current);
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
    setTranscodingInfo(null);

    try {
      await fetch(`${FFMPEG_URL}/upload/start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId, totalChunk: totalChunks, fileName: file.name }),
      });

      for (let i = 0; i < totalChunks; i++) {
        const start = i * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const chunk = file.slice(start, end);

        const formData = new FormData();
        formData.append('chunk', chunk, `chunk_${i}`);
        formData.append('roomId', roomId);
        formData.append('chunkIndex', i.toString());

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
          status: percent === 100 ? 'Upload complete. Transcoding...' : `Uploading: ${percent}%`,
        });
      }

      await fetch(`${FFMPEG_URL}/upload/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId }),
      });

      setUploadProgress({ percent: 100, status: 'Transcoding video...' });
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

  // ─── Leave Room ───────────────────────────
  const leaveRoom = () => {
    socketRef.current?.emit('leave-room', { roomId });
    navigate('/');
  };

  // ─── Promote Member ───────────────────────
  const promoteMember = (targetName) => {
    socketRef.current?.emit('promote-member', { roomId, targetName });
  };

  // ─── Kick Member ──────────────────────────
  const kickMember = (targetName) => {
    socketRef.current?.emit('kick-member', { roomId, targetName });
  };

  // ─── Reset Room (re-upload) ───────────────
  const resetRoom = () => {
    socketRef.current?.emit('reset-room', { roomId });
  };

  // ─── Render ───────────────────────────────
  if (!memberName) return null;

  const isAdmin = myRole === 'admin';

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
            <span className={`badge ${isAdmin ? 'badge-admin' : 'badge-member'}`}>
              {isAdmin ? '👑 Admin' : '👤 Member'}
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
          <button className="btn btn-leave" onClick={leaveRoom} title="Leave Room">
            🚪 Leave
          </button>
        </div>
      </header>

      {/* Main Layout */}
      <div className="room-layout">
        {/* Video / Upload Area */}
        <div className="glass-card video-container">
          {isReady ? (
            <div className="video-wrapper">
              <video
                ref={videoRef}
                controls
                onPlay={onPlay}
                onPause={onPause}
                onSeeked={onSeeked}
              />
              {hlsError && (
                <div className="hls-error-overlay">
                  <span>⚠️ {hlsError}</span>
                </div>
              )}
              {isAdmin && (
                <button className="btn btn-reset" onClick={resetRoom} title="Upload new video">
                  🔄 New Video
                </button>
              )}
            </div>
          ) : uploadProgress ? (
            <div className="upload-progress">
              <span className="upload-progress-icon">
                {uploadProgress.percent < 100 ? '📤' : '⚙️'}
              </span>
              <div className="upload-progress-text">{uploadProgress.status}</div>
              <div className="upload-progress-sub">
                {uploadProgress.percent < 100
                  ? `${uploadProgress.percent}% uploaded`
                  : 'Waiting for FFmpeg to produce playable segments...'
                }
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${uploadProgress.percent}%` }} />
              </div>
              {transcodingInfo && (
                <div className="transcoding-status">
                  <span className="transcoding-spinner" />
                  Transcoded {transcodingInfo.totalSecs}s of video
                  {transcodingInfo.speed && ` at ${transcodingInfo.speed}x speed`}
                  {transcodingInfo.fps && ` (${transcodingInfo.fps} fps)`}
                </div>
              )}
            </div>
          ) : isAdmin ? (
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
            <div className="waiting-area">
              <span className="waiting-icon">⏳</span>
              <div className="waiting-title">Waiting for admin to upload a video...</div>
              <div className="waiting-hint">The stream will start automatically</div>
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="glass-card room-sidebar">
          <h3 className="sidebar-title">👥 Members ({members.length || 1})</h3>
          <div className="member-list">
            {(members.length > 0 ? members : [{ name: memberName, role: myRole }]).map((m, i) => (
              <div key={m.name + i} className="member-item">
                <div className="member-avatar" style={m.role === 'admin' ? { background: 'var(--gradient-accent)' } : {}}>
                  {m.name?.charAt(0).toUpperCase()}
                </div>
                <div className="member-info">
                  <div className="member-name">
                    {m.name}
                    {m.name === memberName && <span className="you-tag"> (you)</span>}
                  </div>
                  <span className={`badge ${m.role === 'admin' ? 'badge-admin' : 'badge-member'} member-role`}>
                    {m.role === 'admin' ? '👑 Admin' : '👤 Member'}
                  </span>
                </div>
                <div className="member-actions">
                  <span className="online-dot" />
                  {isAdmin && m.name !== memberName && (
                    <div className="admin-controls">
                      {m.role !== 'admin' && (
                        <button
                          className="member-action-btn promote"
                          onClick={() => promoteMember(m.name)}
                          title="Promote to Admin"
                        >👑</button>
                      )}
                      <button
                        className="member-action-btn kick"
                        onClick={() => kickMember(m.name)}
                        title="Kick from room"
                      >✕</button>
                    </div>
                  )}
                </div>
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
              <span className="room-info-value">{isAdmin ? 'Admin' : 'Member'}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
