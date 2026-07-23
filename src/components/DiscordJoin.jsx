import { useEffect, useState } from 'react'
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

function discordJoinExtras(user) {
  const extras = { discordId: user.id }
  if (user.avatar) {
    extras.avatarUrl = `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=96`
  }
  return extras
}

// The activity replaces the whole create/join flow: the voice channel is
// the room. With Discord auth we know who you are and join automatically;
// without it (declined / failed) we fall back to a typed name.
export default function DiscordJoin({ playerId, roomCode, user, onJoined }) {
  const discordName = user ? (user.global_name ?? user.username) : null
  const [name, setName] = useState(getSavedName())
  const [busy, setBusy] = useState(Boolean(discordName))
  const [error, setError] = useState(null)

  async function join(displayName, extras) {
    setBusy(true)
    setError(null)
    try {
      saveName(displayName)
      // First connection through Discord's proxy can be slow — give it room
      await withTimeout(
        joinOrCreateRoom(roomCode, playerId, displayName, extras),
        25000,
        "Couldn't reach the game — try again in a moment",
      )
      onJoined(roomCode)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  useEffect(() => {
    if (discordName) join(discordName, discordJoinExtras(user))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (discordName) {
    return (
      <main className="shell">
        <h1>Namedrop</h1>
        <p className="muted">
          Joining as <strong className="accent">{discordName}</strong>…
        </p>
        {error && (
          <>
            <p className="error">{error}</p>
            <button
              className="primary"
              onClick={() => join(discordName, discordJoinExtras(user))}
              disabled={busy}
            >
              Try again
            </button>
          </>
        )}
      </main>
    )
  }

  function handleSubmit(event) {
    event.preventDefault()
    const trimmed = name.trim()
    if (!trimmed) {
      setError('Pick a display name first')
      return
    }
    join(trimmed, {})
  }

  return (
    <main className="shell">
      <h1>Namedrop</h1>
      <p className="muted">Everyone can see who you are — except you.</p>
      <form
        onSubmit={handleSubmit}
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
