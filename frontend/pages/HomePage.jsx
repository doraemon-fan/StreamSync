// frontend/pages/HomePage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { BACKEND_URL } from "../src/config";

export default function HomePage() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState("");
  const [joinRoomId, setJoinRoomId] = useState("");
  const [joinName, setJoinName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err1, setErr1] = useState("");
  const [err2, setErr2] = useState("");
  const [ts, setTs] = useState("");

  useEffect(() => {
    setTs(new Date().toISOString().slice(0, 19).replace("T", " "));
  }, []);

  async function handleCreate() {
    if (!adminName.trim()) return setErr1("username required");
    setLoading(true);
    setErr1("");
    try {
      const res = await fetch(`${BACKEND_URL}/room/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adminName: adminName.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(`/room/${data.roomId}?name=${adminName.trim()}&role=admin`);
    } catch (e) {
      setErr1(e.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleJoin() {
    if (!joinRoomId.trim() || !joinName.trim())
      return setErr2("room_id and username required");
    setLoading(true);
    setErr2("");
    try {
      const res = await fetch(`${BACKEND_URL}/room/join`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          roomId: joinRoomId.trim(),
          memberName: joinName.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      navigate(
        `/room/${joinRoomId.trim()}?name=${joinName.trim()}&role=member`,
      );
    } catch (e) {
      setErr2(e.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={s.hud}>
      <div style={s.scanline} />
      {["tl", "tr", "bl", "br"].map((p) => (
        <div key={p} style={{ ...s.corner, ...s["c_" + p] }} />
      ))}

      {/* TOPBAR */}
      <div style={s.topbar}>
        <div>
          <div style={s.logo}>
            STREAM<span style={{ color: "#39ff14" }}>SYNC</span>
          </div>
          <div style={s.logoSub}>// synchronized watch party system v1.0</div>
        </div>
        <div style={s.topbarStatus}>
          <div style={s.statusLabel}>SYS_STATUS</div>
          <div style={s.statusDot} />
          <div style={{ fontSize: 9, color: "#00ff41", letterSpacing: 1 }}>
            ONLINE
          </div>
        </div>
      </div>

      {/* MAIN */}
      <div style={s.main}>
        {/* CREATE */}
        <div style={s.panel}>
          <div style={s.panelHead}>init_session</div>
          <div style={s.bracketBox}>
            {["tl", "tr", "bl", "br"].map((p) => (
              <div key={p} style={{ ...s.bc, ...s["bc_" + p] }} />
            ))}
            <div style={s.cmdDesc}>create new room + become host</div>
            <input
              style={s.input}
              placeholder="enter_username"
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            />
            <button style={s.btn} disabled={loading} onClick={handleCreate}>
              <span style={{ color: "rgba(0,255,65,0.4)" }}>$</span> create_room
              --host
            </button>
          </div>
          {err1 && <div style={s.err}>! {err1}</div>}
          <div style={{ marginTop: 16 }}>
            {[
              ["protocol", "HLS + WebSocket"],
              ["sync_method", "socket.io"],
              ["transcode", "FFmpeg → h264"],
              ["chunks", "2MB sequential"],
            ].map(([k, v]) => (
              <div key={k} style={s.infoRow}>
                <span>{k}</span>
                <span style={{ color: "rgba(0,255,65,0.6)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>

        {/* DIVIDER */}
        <div style={s.divider} />

        {/* JOIN */}
        <div style={{ ...s.panel, position: "relative" }}>
          <div style={s.glyph}>//</div>
          <div style={s.panelHead}>join_session</div>
          <div style={s.bracketBox}>
            {["tl", "tr", "bl", "br"].map((p) => (
              <div key={p} style={{ ...s.bc, ...s["bc_" + p] }} />
            ))}
            <div style={s.cmdDesc}>connect to existing room via id</div>
            <input
              style={s.input}
              placeholder="room_id"
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
            />
            <input
              style={s.input}
              placeholder="enter_username"
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleJoin()}
            />
            <button
              style={{ ...s.btn, ...s.btnGreen }}
              disabled={loading}
              onClick={handleJoin}
            >
              <span style={{ color: "rgba(57,255,20,0.4)" }}>$</span> join_room
              --connect
            </button>
          </div>
          {err2 && <div style={s.err}>! {err2}</div>}
          <div style={{ marginTop: 16 }}>
            {[
              ["room_id_format", "8 char hex"],
              ["max_members", "unlimited"],
              ["late_join", "auto-sync enabled"],
              ["storage", "tmpfs RAM disk"],
            ].map(([k, v]) => (
              <div key={k} style={s.infoRow}>
                <span>{k}</span>
                <span style={{ color: "rgba(0,255,65,0.6)" }}>{v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* FOOTER */}
      <div style={s.footer}>
        <span>
          streamsync // hls streaming + realtime sync // ffmpeg + socket.io +
          nginx
        </span>
        <span>{ts}</span>
      </div>
    </div>
  );
}

const s = {
  hud: {
    background: "#050806",
    minHeight: "100vh",
    fontFamily: "'JetBrains Mono',monospace",
    color: "#00ff41",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  scanline: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background:
      "repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,255,65,0.015) 2px,rgba(0,255,65,0.015) 4px)",
    pointerEvents: "none",
    zIndex: 0,
  },
  corner: {
    position: "absolute",
    width: 20,
    height: 20,
    borderColor: "#00ff41",
    borderStyle: "solid",
    opacity: 0.6,
  },
  c_tl: { top: 8, left: 8, borderWidth: "1px 0 0 1px" },
  c_tr: { top: 8, right: 8, borderWidth: "1px 1px 0 0" },
  c_bl: { bottom: 8, left: 8, borderWidth: "0 0 1px 1px" },
  c_br: { bottom: 8, right: 8, borderWidth: "0 1px 1px 0" },
  topbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "12px 24px",
    borderBottom: "1px solid rgba(0,255,65,0.2)",
    position: "relative",
    zIndex: 1,
  },
  logo: {
    fontSize: 18,
    fontWeight: 700,
    letterSpacing: 2,
    color: "#00ff41",
    textShadow: "0 0 8px rgba(0,255,65,0.4)",
  },
  logoSub: {
    fontSize: 9,
    color: "rgba(0,255,65,0.3)",
    letterSpacing: 1,
    marginTop: 2,
  },
  topbarStatus: { display: "flex", gap: 16, alignItems: "center" },
  statusLabel: { fontSize: 9, color: "rgba(0,255,65,0.4)", letterSpacing: 1 },
  statusDot: { width: 6, height: 6, background: "#00ff41" },
  main: {
    display: "grid",
    gridTemplateColumns: "minmax(0,1fr) 1px minmax(0,1fr)",
    flex: 1,
    padding: 24,
    position: "relative",
    zIndex: 1,
    width: "100%",
  },
  divider: { background: "rgba(0,255,65,0.2)", width: 1, margin: "0 24px" },
  panel: { padding: "0 20px", minWidth: 0, overflow: "hidden" },
  panelHead: {
    fontSize: 9,
    letterSpacing: 2,
    color: "rgba(0,255,65,0.5)",
    marginBottom: 16,
    display: "flex",
    alignItems: "center",
    gap: 8,
    textTransform: "uppercase",
    paddingLeft: 4,
  },
  bracketBox: {
    border: "1px solid rgba(0,255,65,0.25)",
    padding: 16,
    marginBottom: 12,
    position: "relative",
  },
  bc: {
    position: "absolute",
    width: 8,
    height: 8,
    borderColor: "#00ff41",
    borderStyle: "solid",
    opacity: 0.4,
  },
  bc_tl: { top: -1, left: -1, borderWidth: "2px 0 0 2px" },
  bc_tr: { top: -1, right: -1, borderWidth: "2px 2px 0 0" },
  bc_bl: { bottom: -1, left: -1, borderWidth: "0 0 2px 2px" },
  bc_br: { bottom: -1, right: -1, borderWidth: "0 2px 2px 0" },
  cmdDesc: {
    fontSize: 9,
    color: "rgba(0,255,65,0.35)",
    letterSpacing: 1,
    marginBottom: 14,
  },
  input: {
    width: "100%",
    background: "transparent",
    border: "none",
    borderBottom: "1px solid rgba(0,255,65,0.3)",
    color: "#00ff41",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 12,
    padding: "8px 4px",
    outline: "none",
    marginBottom: 12,
    caretColor: "#00ff41",
    display: "block",
  },
  btn: {
    width: "100%",
    background: "transparent",
    border: "1px solid rgba(0,255,65,0.4)",
    color: "#00ff41",
    fontFamily: "'JetBrains Mono',monospace",
    fontSize: 10,
    padding: 10,
    cursor: "pointer",
    letterSpacing: 2,
    textTransform: "uppercase",
    marginTop: 4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
  },
  btnGreen: { borderColor: "rgba(57,255,20,0.4)", color: "#39ff14" },
  err: {
    fontSize: 10,
    color: "#ff3333",
    letterSpacing: 1,
    marginTop: 8,
    padding: "6px 0",
  },
  infoRow: {
    display: "flex",
    justifyContent: "space-between",
    fontSize: 10,
    color: "rgba(0,255,65,0.4)",
    padding: "4px 0",
    borderBottom: "1px solid rgba(0,255,65,0.06)",
  },
  footer: {
    fontSize: 9,
    color: "rgba(0,255,65,0.2)",
    letterSpacing: 1,
    padding: "10px 24px",
    borderTop: "1px solid rgba(0,255,65,0.1)",
    display: "flex",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 1,
  },
  glyph: {
    color: "rgba(0,255,65,0.05)",
    fontSize: 80,
    position: "absolute",
    right: 20,
    top: "50%",
    transform: "translateY(-50%)",
    lineHeight: 1,
    pointerEvents: "none",
    zIndex: 0,
    fontWeight: 700,
  },
};
