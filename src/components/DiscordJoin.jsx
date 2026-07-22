import { useEffect, useState } from 'react'
import { getSavedName, saveName } from '../identity'
import { joinOrCreateRoom } from '../lib/room'
import { searchWikipedia } from '../lib/wikipedia'

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
  const [diag, setDiag] = useState(null)

  // Self-test both proxy pipes so a broken URL mapping shows up as a
  // readable ✓/✗ line instead of a silent hang.
  useEffect(() => {
    ;(async () => {
      const probe = async (fn) => {
        try {
          await withTimeout(fn(), 6000, 'timeout')
          return true
        } catch {
          return false
        }
      }
      const [database, wikipedia] = await Promise.all([
        probe(async () => {
          const res = await fetch(
            'https://namedrop-8bf7f-default-rtdb.firebaseio.com/rooms.json?shallow=true',
          )
          if (!res.ok) throw new Error('bad response')
        }),
        probe(() => searchWikipedia('test')),
      ])
      setDiag({ database, wikipedia })
    })()
  }, [])

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
        "Couldn't reach the game database — try Jump in once more; if it keeps failing, the /firebase URL mapping is likely wrong",
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
          Jump in
        </button>
      </form>
      {error && <p className="error">{error}</p>}
      {error?.includes('in progress') && (
        <p className="muted">
          You'll be able to join as soon as the current round wraps up.
        </p>
      )}
      {diag && (!diag.database || !diag.wikipedia) && (
        <p className="error">
          Connection check — database: {diag.database ? '✓' : '✗'} · wikipedia:{' '}
          {diag.wikipedia ? '✓' : '✗'}
        </p>
      )}
      <p className="muted" style={{ fontSize: '0.75rem' }}>
        build 8
      </p>
    </main>
  )
}
