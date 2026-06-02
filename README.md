# StreamSync

A real-time synchronized watch party platform. Upload a video, share a room ID, watch together — play, pause, and seek stay in sync across all viewers.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        CLIENT                               │
│                                                             │
│   HomePage          RoomPage (admin)    RoomPage (member)  │
│   create/join  ───► upload video   ───► watch + sync       │
│                      Blob.slice()        hls.js player      │
│                      fetch chunks        socket.io          │
└────────┬──────────────────┬──────────────────┬─────────────┘
         │                  │                  │
         ▼                  ▼                  ▼
┌─────────────────┐  ┌─────────────┐  ┌──────────────────┐
│    BACKEND      │  │   FFMPEG    │  │      NGINX       │
│   (Node/TS)     │  │  SERVICE    │  │                  │
│                 │  │  (Node/TS)  │  │  serves /hls/*   │
│  room create    │  │             │  │  static segments │
│  room join      │  │  /upload    │  │  to all viewers  │
│  room state     │  │  /start     │  │                  │
│                 │  │  /chunk     │  └──────────────────┘
│  socket.io      │  │  /complete  │           ▲
│  play/pause     │◄─┤             │           │
│  seek/sync      │  │  FFmpeg     │           │
│  stream-ready   │  │  transcode  │           │
│                 │  │  → HLS      ├───────────┘
└─────────────────┘  │  segments   │  writes to
    port 5000        └─────────────┘  shared RAM disk
                         port 4000   /hls/roomId/
```

---

## Upload → Playback Flow

```
1. admin creates room  ──► POST /room/create  ──► roomId generated
2. admin uploads file  ──► Blob.slice() 2MB chunks
                       ──► POST /upload/start
                       ──► POST /upload/chunk  (x N)
                       ──► POST /upload/complete
3. FFmpeg runs         ──► reads /temp/roomId/upload.tmp
                       ──► transcodes to h264/aac
                       ──► writes HLS segments to /hls/roomId/
4. FFmpeg done         ──► POST /room/ready  (backend notified)
5. backend             ──► roomStore.setReady(roomId)
                       ──► io.to(roomId).emit('stream-ready')
6. all viewers         ──► hls.js loads /hls/roomId/index.m3u8
                       ──► video plays
```

---

## Sync Flow

```
any member hits play
    │
    ▼
socket.emit('play', { roomId, timestamp })
    │
    ▼
backend receives ──► roomState[roomId] = { isPlaying: true, timestamp, updatedAt }
                 ──► socket.to(roomId).emit('play', { timestamp })
    │
    ▼
all other members receive 'play'
    ──► video.currentTime = timestamp
    ──► video.play()

late joiner
    ──► socket.emit('join-room', { roomId, memberName })
    ──► backend calculates current position (timestamp + elapsed)
    ──► socket.emit('sync-state', { isPlaying, timestamp })
    ──► player snaps to current position
```

---

## Container Structure

```
StreamSync/
├── backend/          Express + socket.io
│   ├── src/
│   │   ├── server.ts         entry point, socket.io setup
│   │   ├── routes/room.ts    REST endpoints
│   │   ├── sockets/sync.ts   WebSocket sync handlers
│   │   ├── utils/roomStore.ts in-memory room state
│   │   └── types/room.ts     Room, Member types
│   └── Dockerfile
│
├── ffmpeg/           FFmpeg transcoding service
│   ├── src/server.ts chunk upload + FFmpeg runner
│   ├── public/
│   │   ├── upload.html       fallback upload UI
│   │   └── play.html         fallback player
│   └── Dockerfile
│
├── frontend/         React + Vite
│   ├── pages/
│   │   ├── HomePage.jsx      create/join room
│   │   └── RoomPage.jsx      video + sync UI
│   └── Dockerfile
│
├── nginx.conf        serves /hls/* segments
└── docker-compose.yml
```

---

## Stack

| Layer | Tech |
|---|---|
| Frontend | React, Vite, socket.io-client, hls.js |
| Backend | Node.js, TypeScript, Express, socket.io |
| FFmpeg service | Node.js, TypeScript, Express, multer, FFmpeg |
| Streaming | HLS (HTTP Live Streaming) |
| Sync | WebSocket via socket.io |
| Reverse proxy | nginx |
| Containers | Docker, docker-compose |
| Storage | tmpfs RAM disk (shared volume) |

---

## Running Locally

```bash
git clone https://github.com/Divyanshu-yadav-18/StreamSync
cd StreamSync
docker-compose up --build
```

| Service | URL |
|---|---|
| Frontend | http://localhost:3001 |
| Backend API | http://localhost:5000 |
| FFmpeg service | http://localhost:4000 |
| HLS segments | http://localhost:8080/hls/ |

---

## API Reference

**Backend — Room**

```
POST /room/create     { adminName }          → { roomId, room }
POST /room/join       { roomId, memberName } → { room }
GET  /room/:roomId                           → { room }
POST /room/ready      { roomId }             → { ok }  (called by FFmpeg)
```

**FFmpeg — Upload**

```
POST /upload/start    { roomId, totalChunk, fileName } → { ok }
POST /upload/chunk    FormData: roomId, chunkIndex, totalChunk, chunk → { ok }
POST /upload/complete { roomId } → { ok }
```

**Socket Events**

```
emit  join-room    { roomId, memberName }
emit  play         { roomId, timestamp }
emit  pause        { roomId, timestamp }
emit  seek         { roomId, timestamp }

on    stream-ready { roomId }
on    sync-state   { isPlaying, timestamp }
on    play         { timestamp }
on    pause        { timestamp }
on    seek         { timestamp }
on    member-joined { memberName }
on    member-left  { socketId }
```
