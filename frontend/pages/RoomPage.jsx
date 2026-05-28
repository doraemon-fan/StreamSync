// frontend/pages/RoomPage.jsx
import { useState, useEffect, useRef } from 'react'
import { useParams, useSearchParams } from 'react-router-dom'
import { BACKEND_URL, FFMPEG_URL } from '../src/config'
import { io } from 'socket.io-client'
import Hls from 'hls.js'

const CHUNK_SIZE = 2 * 1024 * 1024

export default function RoomPage() {
  const { roomId }      = useParams()
  const [searchParams]  = useSearchParams()
  const name            = searchParams.get('name') || 'guest'
  const role            = searchParams.get('role') || 'member'
  const isAdmin         = role === 'admin'

  const [status, setStatus]       = useState('connecting...')
  const [members, setMembers]     = useState([])
  const [isReady, setIsReady]     = useState(false)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress]   = useState(0)
  const [ts, setTs]               = useState('')

  const videoRef  = useRef(null)
  const socketRef = useRef(null)
  const isSyncing = useRef(false)
  const hlsRef    = useRef(null)

  useEffect(() => {
    setTs(new Date().toISOString().slice(0,19).replace('T',' '))
    const socket = io(BACKEND_URL)
    socketRef.current = socket

    socket.on('connect', () => {
      socket.emit('join-room', { roomId, memberName: name })
      setStatus('joined room — waiting for stream')
    })
    socket.on('stream-ready', () => {
      setIsReady(true)
      setStatus('stream ready — loading player')
      loadPlayer()
    })
    socket.on('play', ({ timestamp }) => {
      if (!videoRef.current) return
      isSyncing.current = true
      videoRef.current.currentTime = timestamp
      videoRef.current.play().finally(() => { isSyncing.current = false })
      setStatus('▶ playing')
    })
    socket.on('pause', ({ timestamp }) => {
      if (!videoRef.current) return
      isSyncing.current = true
      videoRef.current.currentTime = timestamp
      videoRef.current.pause()
      isSyncing.current = false
      setStatus('⏸ paused')
    })
    socket.on('seek', ({ timestamp }) => {
      if (!videoRef.current) return
      isSyncing.current = true
      videoRef.current.currentTime = timestamp
      isSyncing.current = false
    })
    socket.on('sync-state', ({ isPlaying, timestamp }) => {
      if (!videoRef.current) return
      isSyncing.current = true
      videoRef.current.currentTime = timestamp
      if (isPlaying) {
        videoRef.current.play().finally(() => { isSyncing.current = false })
      } else {
        videoRef.current.pause()
        isSyncing.current = false
      }
      setIsReady(true)
      loadPlayer()
    })
    socket.on('member-joined', ({ memberName }) => {
      setMembers(prev => [...prev, memberName])
      setStatus(`${memberName} connected`)
    })
    socket.on('member-left', () => setStatus('member disconnected'))

    fetch(`${BACKEND_URL}/room/${roomId}`)
      .then(r => r.json())
      .then(data => {
        if (data.room?.isReady) {
          setIsReady(true)
          setStatus('stream ready')
          setTimeout(() => loadPlayer(), 500)
        }
      })

    return () => socket.disconnect()
  }, [roomId])

  function loadPlayer() {
    if (!videoRef.current) { setTimeout(() => loadPlayer(), 300); return }
    const hlsUrl = `${FFMPEG_URL}/hls/${roomId}/index.m3u8`
    if (hlsRef.current) hlsRef.current.destroy()
    if (Hls.isSupported()) {
      const hls = new Hls({ liveSyncDurationCount: 3 })
      hlsRef.current = hls
      hls.loadSource(hlsUrl)
      hls.attachMedia(videoRef.current)
      hls.on(Hls.Events.MANIFEST_PARSED, () => setStatus('stream ready'))
      hls.on(Hls.Events.ERROR, (_, data) => {
        if (data.type === Hls.ErrorTypes.NETWORK_ERROR) {
          setStatus('waiting for stream...')
          setTimeout(() => hls.loadSource(hlsUrl), 3000)
        }
      })
    } else if (videoRef.current.canPlayType('application/vnd.apple.mpegurl')) {
      videoRef.current.src = `${FFMPEG_URL}/hls/${roomId}/index.m3u8`
    }
  }

  function handlePlay() {
    if (isSyncing.current || !socketRef.current) return
    socketRef.current.emit('play', { roomId, timestamp: videoRef.current.currentTime })
  }
  function handlePause() {
    if (isSyncing.current || !socketRef.current) return
    socketRef.current.emit('pause', { roomId, timestamp: videoRef.current.currentTime })
  }
  function handleSeeked() {
    if (isSyncing.current || !socketRef.current) return
    socketRef.current.emit('seek', { roomId, timestamp: videoRef.current.currentTime })
  }

  async function handleUpload(file) {
    if (!file) return
    setUploading(true); setProgress(0); setStatus('starting upload...')
    const totalChunk = Math.ceil(file.size / CHUNK_SIZE)
    await fetch(`${FFMPEG_URL}/upload/start`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId, totalChunk, fileName: file.name })
    })
    for (let i = 0; i < totalChunk; i++) {
      const form = new FormData()
      form.append('roomId', roomId)
      form.append('chunkIndex', String(i))
      form.append('totalChunk', String(totalChunk))
      form.append('chunk', file.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE))
      await fetch(`${FFMPEG_URL}/upload/chunk`, { method: 'POST', body: form })
      const pct = Math.round(((i + 1) / totalChunk) * 100)
      setProgress(pct); setStatus(`uploading... ${pct}%`)
    }
    await fetch(`${FFMPEG_URL}/upload/complete`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ roomId })
    })
    setUploading(false); setStatus('processing video...')
    const poll = setInterval(() => {
      fetch(`${BACKEND_URL}/room/${roomId}`).then(r => r.json()).then(data => {
        if (data.room?.isReady) { clearInterval(poll); setIsReady(true); loadPlayer() }
      })
    }, 2000)
  }

  return (
    <div style={s.hud}>
      <div style={s.scanline} />
      {['tl','tr','bl','br'].map(p => <div key={p} style={{...s.corner,...s['c_'+p]}} />)}

      {/* TOPBAR */}
      <div style={s.topbar}>
        <div>
          <div style={s.logo}>STREAM<span style={{color:'#39ff14'}}>SYNC</span></div>
          <div style={s.logoSub}>// room_id: {roomId}</div>
        </div>
        <div style={s.topbarMid}>
          <div style={s.statusChip}>
            <div style={s.statusDot} />
            <span style={{fontSize:9,letterSpacing:1}}>{status}</span>
          </div>
        </div>
        <div style={s.topbarRight}>
          <div style={s.userChip}>
            <span style={{color:'rgba(0,255,65,0.4)'}}>{isAdmin ? '[host]' : '[member]'}</span>
            <span style={{marginLeft:8}}>{name}</span>
          </div>
          <button style={s.copyBtn} onClick={() => navigator.clipboard.writeText(roomId)}>
            cp room_id
          </button>
        </div>
      </div>

      {/* BODY */}
      <div style={s.body}>

        {/* VIDEO PANEL */}
        <div style={s.videoPanel}>
          <div style={s.videoLabel}>// video_feed</div>
          <div style={s.videoWrap}>
            <video
              ref={videoRef} controls
              style={s.video}
              onPlay={handlePlay}
              onPause={handlePause}
              onSeeked={handleSeeked}
            />
          </div>

          {/* UPLOAD */}
          {isAdmin && !isReady && (
            <div style={s.uploadBox}>
              {['tl','tr','bl','br'].map(p => <div key={p} style={{...s.bc,...s['bc_'+p]}} />)}
              <div style={s.uploadLabel}>upload_video --transcode</div>
              <label style={s.fileLabel}>
                <input type="file" accept="video/*" style={{display:'none'}}
                  onChange={e => handleUpload(e.target.files[0])} disabled={uploading} />
                <span style={s.fileBtn}>$ select_file</span>
              </label>
              {uploading && (
                <div style={{marginTop:10}}>
                  <div style={s.progressTrack}>
                    <div style={{...s.progressBar, width:`${progress}%`}} />
                  </div>
                  <div style={{fontSize:9,color:'rgba(0,255,65,0.4)',marginTop:4,letterSpacing:1}}>
                    {progress}% complete
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* SIDEBAR */}
        <div style={s.sidebar}>
          <div style={s.sideSection}>
            <div style={s.sideLabel}>members_list</div>
            <div style={s.memberItem}>
              <span style={{color:'#39ff14'}}>[host]</span>
              <span style={{marginLeft:8,color:isAdmin?'#00ff41':'rgba(0,255,65,0.5)'}}>
                {isAdmin ? name : '?'}
              </span>
            </div>
            {members.map((m, i) => (
              <div key={i} style={s.memberItem}>
                <span style={{color:'rgba(0,255,65,0.4)'}}>[{String(i+1).padStart(2,'0')}]</span>
                <span style={{marginLeft:8}}>{m}</span>
              </div>
            ))}
          </div>

          <div style={{...s.sideSection, marginTop:20}}>
            <div style={s.sideLabel}>sys_info</div>
            {[
              ['room_id', roomId],
              ['role', role],
              ['stream', isReady ? 'ready' : 'pending'],
              ['sync', 'websocket'],
            ].map(([k,v]) => (
              <div key={k} style={s.sysRow}>
                <span style={{color:'rgba(0,255,65,0.35)'}}>{k}</span>
                <span style={{color: v==='ready'?'#39ff14':'rgba(0,255,65,0.6)'}}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={s.footer}>
        <span>streamsync // hls + websocket // ffmpeg → h264 → nginx</span>
        <span>{ts}</span>
      </div>
    </div>
  )
}

const s = {
  hud:{background:'#050806',minHeight:'100vh',fontFamily:"'JetBrains Mono',monospace",color:'#00ff41',position:'relative',overflow:'hidden',display:'flex',flexDirection:'column'},
  scanline:{position:'absolute',top:0,left:0,right:0,bottom:0,background:'repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px)',pointerEvents:'none',zIndex:0},
  corner:{position:'absolute',width:20,height:20,borderColor:'#00ff41',borderStyle:'solid',opacity:0.6},
  c_tl:{top:8,left:8,borderWidth:'1px 0 0 1px'},
  c_tr:{top:8,right:8,borderWidth:'1px 1px 0 0'},
  c_bl:{bottom:8,left:8,borderWidth:'0 0 1px 1px'},
  c_br:{bottom:8,right:8,borderWidth:'0 1px 1px 0'},
  topbar:{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'12px 24px',borderBottom:'1px solid rgba(0,255,65,0.2)',position:'relative',zIndex:1,gap:16},
  logo:{fontSize:16,fontWeight:700,letterSpacing:2,color:'#00ff41',textShadow:'0 0 8px rgba(0,255,65,0.4)'},
  logoSub:{fontSize:9,color:'rgba(0,255,65,0.3)',letterSpacing:1,marginTop:2},
  topbarMid:{flex:1,display:'flex',justifyContent:'center'},
  statusChip:{display:'flex',alignItems:'center',gap:8,border:'1px solid rgba(0,255,65,0.2)',padding:'4px 12px',color:'rgba(0,255,65,0.6)'},
  statusDot:{width:5,height:5,background:'#00ff41'},
  topbarRight:{display:'flex',alignItems:'center',gap:12},
  userChip:{fontSize:10,letterSpacing:1},
  copyBtn:{background:'transparent',border:'1px solid rgba(0,255,65,0.3)',color:'rgba(0,255,65,0.5)',fontFamily:"'JetBrains Mono',monospace",fontSize:9,padding:'4px 10px',cursor:'pointer',letterSpacing:1,textTransform:'uppercase'},
  body:{display:'grid',gridTemplateColumns:'1fr 200px',flex:1,gap:0,position:'relative',zIndex:1},
  videoPanel:{padding:20,display:'flex',flexDirection:'column',gap:12, minWidth:0},
  videoLabel:{fontSize:9,color:'rgba(0,255,65,0.3)',letterSpacing:2,marginBottom:4},
  videoWrap:{border:'1px solid rgba(0,255,65,0.2)',background:'#000',aspectRatio:'16/9',overflow:'hidden'},
  video:{width:'100%',height:'100%',display:'block'},
  uploadBox:{border:'1px solid rgba(0,255,65,0.2)',padding:16,position:'relative'},
  bc:{position:'absolute',width:8,height:8,borderColor:'#00ff41',borderStyle:'solid',opacity:0.4},
  bc_tl:{top:-1,left:-1,borderWidth:'2px 0 0 2px'},
  bc_tr:{top:-1,right:-1,borderWidth:'2px 2px 0 0'},
  bc_bl:{bottom:-1,left:-1,borderWidth:'0 0 2px 2px'},
  bc_br:{bottom:-1,right:-1,borderWidth:'0 2px 2px 0'},
  uploadLabel:{fontSize:9,color:'rgba(0,255,65,0.4)',letterSpacing:2,textTransform:'uppercase',marginBottom:12},
  fileLabel:{cursor:'pointer'},
  fileBtn:{display:'inline-block',border:'1px solid rgba(0,255,65,0.3)',color:'rgba(0,255,65,0.6)',fontSize:10,padding:'6px 14px',letterSpacing:1,fontFamily:"'JetBrains Mono',monospace"},
  progressTrack:{background:'rgba(0,255,65,0.1)',height:2,width:'100%'},
  progressBar:{background:'#00ff41',height:2,transition:'width 0.3s'},
  sidebar:{borderLeft:'1px solid rgba(0,255,65,0.15)',padding:16,display:'flex',flexDirection:'column'},
  sideSection:{},
  sideLabel:{fontSize:9,letterSpacing:2,color:'rgba(0,255,65,0.35)',textTransform:'uppercase',marginBottom:10,paddingBottom:6,borderBottom:'1px solid rgba(0,255,65,0.1)'},
  memberItem:{fontSize:11,padding:'5px 0',borderBottom:'1px solid rgba(0,255,65,0.06)',display:'flex',alignItems:'center'},
  sysRow:{display:'flex',justifyContent:'space-between',fontSize:10,padding:'4px 0',borderBottom:'1px solid rgba(0,255,65,0.06)'},
  footer:{fontSize:9,color:'rgba(0,255,65,0.15)',letterSpacing:1,padding:'8px 24px',borderTop:'1px solid rgba(0,255,65,0.1)',display:'flex',justifyContent:'space-between',position:'relative',zIndex:1},
}
