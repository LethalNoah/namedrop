import { useState } from 'react'
import { leaveRoom, setTurnOrder, startGame } from '../lib/room'

export default function Lobby({ room, roomCode, playerId, onLeft }) {
  const [copied, setCopied] = useState(false)
  const [error, setError] = useState(null)

  const isHost = room.hostId === playerId
  const players = Object.entries(room.players ?? {}).sort(
    ([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
  )
  const canStart = players.length >= 2

  async function handleCopyLink() {
    const url = new URL(window.location.href)
    url.searchParams.set('room', roomCode)
    await navigator.clipboard.writeText(url.toString())
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function handleStart() {
    try {
      await startGame(roomCode)
    } catch (err) {
      setError(err.message)
    }
  }

  async function handleLeave() {
    try {
      await leaveRoom(roomCode, playerId)
    } finally {
      onLeft()
    }
  }

  return (
    <main className="shell">
      <h1>Lobby</h1>
      <div className="room-code" aria-label="Room code">
        {roomCode}
      </div>
      <button onClick={handleCopyLink}>{copied ? 'Copied!' : 'Copy invite link'}</button>

      <ul className="player-list">
        {players.map(([id, player]) => (
          <li key={id} className={player.connected ? '' : 'disconnected'}>
            <span className={`presence-dot ${player.connected ? 'on' : 'off'}`} />
            <span className="player-name">{player.name}</span>
            {id === room.hostId && <span className="badge">host</span>}
            {id === playerId && <span className="badge you">you</span>}
          </li>
        ))}
      </ul>

      <div className="toggle-row">
        <span className="toggle-label">Turns</span>
        {['rotating', 'free'].map((mode) => (
          <button
            key={mode}
            className={`seg ${(room.turnOrder ?? 'rotating') === mode ? 'active' : ''}`}
            disabled={!isHost}
            onClick={() => setTurnOrder(roomCode, mode)}
          >
            {mode === 'free' ? 'Free-for-all' : 'Take turns'}
          </button>
        ))}
      </div>

      {isHost ? (
        <>
          <button className="primary" onClick={handleStart} disabled={!canStart}>
            Start game
          </button>
          {!canStart && <p className="muted">Need at least 2 players to start.</p>}
        </>
      ) : (
        <p className="muted">Waiting for the host to start…</p>
      )}

      <button className="ghost" onClick={handleLeave}>
        Leave room
      </button>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
