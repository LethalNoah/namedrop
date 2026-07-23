import { useState } from 'react'
import { getSavedName, saveName } from '../identity'
import { joinOrCreateRoom } from '../lib/room'

function withTimeout(promise, ms, label) {
  return Promise.race([
    promise,
    new Promise((_, reject) =>
      setTimeout(() => reject(new Error(label)), ms),
    ),
  ])
}

// The activity replaces the whole create/join flow: the voice channel is
// the room, so newcomers only need a display name.
export default function DiscordJoin({ playerId, roomCode, onJoined }) {
  const [name, setName] = useState(getSavedName())
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  async function handleJoin(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Pick a display name first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      saveName(trimmed)
      // First connection through Discord's proxy can be slow — give it room
      await withTimeout(
        joinOrCreateRoom(roomCode, playerId, trimmed),
        25000,
        "Couldn't reach the game — try Jump in once more",
      )
      onJoined(roomCode)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  return (
    <main className="shell">
      <h1>Namedrop</h1>
      <p className="muted">Everyone can see who you are — except you.</p>
      <form
        onSubmit={handleJoin}
        style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <label className="field">
          Your name
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Display name"
            maxLength={24}
            autoFocus
          />
        </label>
        <button className="primary" type="submit" disabled={busy}>
          {busy ? 'Joining…' : 'Jump in'}
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {error?.includes('in progress') && (
        <p className="muted">
          You'll be able to join as soon as the current round wraps up.
        </p>
      )}
    </main>
  )
}
