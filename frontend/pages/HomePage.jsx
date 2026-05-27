// frontend/pages/HomePage.jsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function HomePage() {
  const navigate = useNavigate()

  const [adminName, setAdminName]   = useState('')
  const [joinRoomId, setJoinRoomId] = useState('')
  const [joinName, setJoinName]     = useState('')
  const [loading, setLoading]       = useState(false)
  const [error, setError]           = useState('')

  // ── CREATE ROOM ───────────────────────────────────────────────
  async function handleCreate() {
    if (!adminName.trim()) return setError('Enter your name')
    setLoading(true)
    setError('')

    try {
      const res  = await fetch('http://localhost:5000/room/create', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ adminName: adminName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // go to room page as admin
      navigate(`/room/${data.roomId}?name=${adminName.trim()}&role=admin`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  // ── JOIN ROOM ─────────────────────────────────────────────────
  async function handleJoin() {
    if (!joinRoomId.trim() || !joinName.trim()) return setError('Enter room ID and your name')
    setLoading(true)
    setError('')

    try {
      const res  = await fetch('http://localhost:5000/room/join', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ roomId: joinRoomId.trim(), memberName: joinName.trim() })
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.error)

      // go to room page as member
      navigate(`/room/${joinRoomId.trim()}?name=${joinName.trim()}&role=member`)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-2">StreamSync</h1>
      <p className="text-gray-400 mb-10">Watch videos together, in sync.</p>

      {error && (
        <div className="mb-6 text-red-400 text-sm">{error}</div>
      )}

      <div className="flex flex-col md:flex-row gap-6 w-full max-w-2xl">

        {/* CREATE ROOM */}
        <div className="flex-1 bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Create a Room</h2>
          <p className="text-gray-400 text-sm">Start a new watch party and invite friends.</p>

          <input
            type="text"
            placeholder="Your name"
            value={adminName}
            onChange={e => setAdminName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
            className="bg-gray-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleCreate}
            disabled={loading}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            {loading ? 'Creating...' : 'Create Room'}
          </button>
        </div>

        {/* JOIN ROOM */}
        <div className="flex-1 bg-gray-900 rounded-2xl p-6 flex flex-col gap-4">
          <h2 className="text-lg font-semibold">Join a Room</h2>
          <p className="text-gray-400 text-sm">Enter a room ID shared by your friend.</p>

          <input
            type="text"
            placeholder="Room ID"
            value={joinRoomId}
            onChange={e => setJoinRoomId(e.target.value)}
            className="bg-gray-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <input
            type="text"
            placeholder="Your name"
            value={joinName}
            onChange={e => setJoinName(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleJoin()}
            className="bg-gray-800 rounded-lg px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-blue-500"
          />

          <button
            onClick={handleJoin}
            disabled={loading}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 rounded-lg px-4 py-2 text-sm font-medium transition"
          >
            {loading ? 'Joining...' : 'Join Room'}
          </button>
        </div>

      </div>
    </div>
  )
}
