import { useState } from 'react'
import { getSavedName, saveName } from '../identity'
import { createRoom, joinRoom, normalizeCode } from '../lib/room'

export default function Home({ playerId, initialCode, onJoined }) {
  const [name, setName] = useState(getSavedName())
  const [code, setCode] = useState('')
  const [inviteCode, setInviteCode] = useState(normalizeCode(initialCode ?? ''))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  const trimmedName = name.trim()

  async function run(action) {
    if (!trimmedName) {
      setError('Pick a display name first')
      return
    }
    setBusy(true)
    setError(null)
    try {
      saveName(trimmedName)
      const joinedCode = await action()
      onJoined(joinedCode)
    } catch (err) {
      setError(err.message)
      setBusy(false)
    }
  }

  function handleCreate() {
    run(() => createRoom(playerId, trimmedName))
  }

  function handleJoinCode(roomCode) {
    if (!roomCode) {
      setError('Enter a room code')
      return
    }
    run(async () => {
      await joinRoom(roomCode, playerId, trimmedName)
      return roomCode
    })
  }

  function leaveInviteFlow() {
    setInviteCode('')
    setError(null)
    const url = new URL(window.location.href)
    url.searchParams.delete('room')
    window.history.replaceState(null, '', url)
  }

  const nameField = (
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
  )

  // Arriving via an invite link: join-focused screen, no create button in sight
  if (inviteCode) {
    return (
      <main className="shell">
        <h1>Namedrop</h1>
        <p className="muted">You've been invited to room</p>
        <div className="room-code">{inviteCode}</div>
        {nameField}
        <button className="primary" onClick={() => handleJoinCode(inviteCode)} disabled={busy}>
          Join game
        </button>
        {error && <p className="error">{error}</p>}
        <button className="ghost" onClick={leaveInviteFlow}>
          or start your own room instead
        </button>
      </main>
    )
  }

  return (
    <main className="shell">
      <h1>Namedrop</h1>
      <p className="muted">Everyone can see who you are — except you.</p>

      {nameField}

      <button className="primary" onClick={handleCreate} disabled={busy}>
        Create a room
      </button>

      <div className="divider">or join one</div>

      <form
        className="join-row"
        onSubmit={(e) => {
          e.preventDefault()
          handleJoinCode(normalizeCode(code))
        }}
      >
        <input
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="CODE"
          maxLength={4}
          className="code-input"
        />
        <button type="submit" disabled={busy}>
          Join
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </main>
  )
}
