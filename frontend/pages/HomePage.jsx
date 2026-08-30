import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { BACKEND_URL } from '../src/config';
import '../src/styles/HomePage.css';

export default function HomePage() {
  const navigate = useNavigate();
  const [adminName, setAdminName] = useState('');
  const [joinRoomId, setJoinRoomId] = useState('');
  const [joinName, setJoinName] = useState('');
  const [error, setError] = useState('');
  const [creatingRoom, setCreatingRoom] = useState(false);
  const [joiningRoom, setJoiningRoom] = useState(false);

  // Auto-dismiss errors after 4s
  useEffect(() => {
    if (!error) return;
    const timer = setTimeout(() => setError(''), 4000);
    return () => clearTimeout(timer);
  }, [error]);

  const createRoom = async () => {
    const name = adminName.trim();
    if (!name) { setError('Enter your name to create a room'); return; }
    setCreatingRoom(true);
    try {
      const res = await fetch(`${BACKEND_URL}/room/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ adminName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create room');
      navigate(`/room/${data.roomId}?name=${encodeURIComponent(name)}&role=admin`);
    } catch (err) {
      setError(err.message);
      setCreatingRoom(false);
    }
  };

  const joinRoom = async () => {
    const name = joinName.trim();
    const id = joinRoomId.trim();
    if (!id || !name) { setError('Enter both Room ID and your name'); return; }
    setJoiningRoom(true);
    try {
      const res = await fetch(`${BACKEND_URL}/room/join`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ roomId: id, memberName: name }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to join room');
      navigate(`/room/${id}?name=${encodeURIComponent(name)}&role=member`);
    } catch (err) {
      setError(err.message);
      setJoiningRoom(false);
    }
  };

  const handleKeyDown = (action) => (e) => {
    if (e.key === 'Enter') action();
  };

  return (
    <div className="home-page">
      <div className="home-content">
        {/* Hero */}
        <div className="home-hero">
          <span className="home-logo">📡</span>
          <h1 className="home-title">
            <span className="text-gradient">StreamSync</span>
          </h1>
          <p className="home-subtitle">Watch together, perfectly in sync</p>
        </div>

        {/* Error */}
        {error && (
          <div className="home-error">
            <div className="error-toast">
              <span>⚠️</span>
              <span>{error}</span>
            </div>
          </div>
        )}

        {/* Action Cards */}
        <div className="home-cards">
          {/* Create Room */}
          <div className="glass-card action-card action-card--create">
            <span className="action-card-icon">🎬</span>
            <h2 className="action-card-title">Create Room</h2>
            <p className="action-card-desc">
              Start a watch party and invite friends with your room code.
            </p>
            <input
              id="create-name-input"
              className="input"
              type="text"
              placeholder="Your name"
              maxLength={30}
              value={adminName}
              onChange={(e) => setAdminName(e.target.value)}
              onKeyDown={handleKeyDown(createRoom)}
              disabled={creatingRoom}
            />
            <button
              id="create-room-btn"
              className={`btn btn-primary ${creatingRoom ? 'btn-loading' : ''}`}
              onClick={createRoom}
              disabled={creatingRoom}
            >
              <span className="btn-text">Create Room</span>
              {creatingRoom && <span className="btn-spinner" />}
            </button>
          </div>

          {/* Join Room */}
          <div className="glass-card action-card action-card--join">
            <span className="action-card-icon">🚀</span>
            <h2 className="action-card-title">Join Room</h2>
            <p className="action-card-desc">
              Enter a room code to join an existing watch party.
            </p>
            <input
              id="join-room-input"
              className="input"
              type="text"
              placeholder="Room ID"
              maxLength={12}
              value={joinRoomId}
              onChange={(e) => setJoinRoomId(e.target.value)}
              onKeyDown={handleKeyDown(joinRoom)}
              disabled={joiningRoom}
            />
            <input
              id="join-name-input"
              className="input"
              type="text"
              placeholder="Your name"
              maxLength={30}
              value={joinName}
              onChange={(e) => setJoinName(e.target.value)}
              onKeyDown={handleKeyDown(joinRoom)}
              disabled={joiningRoom}
            />
            <button
              id="join-room-btn"
              className={`btn btn-primary ${joiningRoom ? 'btn-loading' : ''}`}
              onClick={joinRoom}
              disabled={joiningRoom}
            >
              <span className="btn-text">Join Room</span>
              {joiningRoom && <span className="btn-spinner" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
