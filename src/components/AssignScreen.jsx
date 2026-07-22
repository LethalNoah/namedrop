import { useEffect, useState } from 'react'
import { searchWikipedia } from '../lib/wikipedia'
import { lockCharacter, setRoomStatus } from '../lib/room'

export default function AssignScreen({ room, roomCode, playerId }) {
  const me = room.players?.[playerId]
  const targetId = me?.assignsTo
  const target = targetId ? room.players?.[targetId] : null
  const locked = Boolean(target?.character)

  const [query, setQuery] = useState('')
  const [results, setResults] = useState(null) // null = nothing searched yet
  const [searching, setSearching] = useState(false)
  const [selected, setSelected] = useState(null)
  const [error, setError] = useState(null)

  // Live search, debounced
  useEffect(() => {
    const q = query.trim()
    if (q.length < 2) {
      setResults(null)
      return
    }
    setSearching(true)
    const timer = setTimeout(async () => {
      try {
        setResults(await searchWikipedia(q))
        setError(null)
      } catch (err) {
        setError(err.message)
      } finally {
        setSearching(false)
      }
    }, 350)
    return () => clearTimeout(timer)
  }, [query])

  // Once every player has a character, any client may flip the room to
  // playing — the write is idempotent so racing clients are harmless.
  const players = Object.entries(room.players ?? {})
  const everyoneLocked = players.length > 0 && players.every(([, p]) => p.character)
  useEffect(() => {
    if (room.status === 'assigning' && everyoneLocked) {
      setRoomStatus(roomCode, 'playing')
    }
  }, [room.status, everyoneLocked, roomCode])

  async function handleConfirm() {
    try {
      await lockCharacter(roomCode, targetId, {
        title: selected.title,
        description: selected.description,
        thumbnailUrl: selected.thumbnailUrl,
      })
    } catch (err) {
      setError(err.message)
    }
  }

  if (!me || !target) {
    return (
      <main className="shell">
        <p className="muted">You're not part of this round.</p>
      </main>
    )
  }

  // Already locked in: show who we're still waiting on.
  // (Never render `me.character` here — a player must not see their own.)
  if (locked) {
    const isHost = room.hostId === playerId
    return (
      <main className="shell">
        <h1>Locked in!</h1>
        <p className="muted">
          <strong>{target.name}</strong> will be{' '}
          <strong>{target.character.title}</strong>. Waiting for the others…
        </p>
        <ul className="player-list">
          {players.map(([id, player]) => (
            <li key={id}>
              <span className="player-name">
                {player.name}
                {player.connected === false && (
                  <span className="offline-chip">offline</span>
                )}
              </span>
              <span className={player.character ? 'status-done' : 'status-waiting'}>
                {player.character ? '✓ picked' : 'choosing…'}
              </span>
            </li>
          ))}
        </ul>
        {/* Escape hatch if a picker dropped and the round can't finish */}
        {isHost && (
          <button className="ghost" onClick={() => setRoomStatus(roomCode, 'lobby')}>
            Cancel round — back to lobby
          </button>
        )}
      </main>
    )
  }

  // Confirm step for a tapped result
  if (selected) {
    return (
      <main className="shell">
        <h1>
          Assign to <span className="accent">{target.name}</span>?
        </h1>
        <div className="confirm-card">
          {selected.thumbnailUrl ? (
            <img src={selected.thumbnailUrl} alt={selected.title} />
          ) : (
            <div className="thumb-placeholder large">?</div>
          )}
          <h2>{selected.title}</h2>
          {selected.description && <p className="muted">{selected.description}</p>}
        </div>
        <button className="primary" onClick={handleConfirm}>
          Lock it in
        </button>
        <button className="ghost" onClick={() => setSelected(null)}>
          Back to search
        </button>
        {error && <p className="error">{error}</p>}
      </main>
    )
  }

  return (
    <main className="shell">
      <h1>
        You're choosing for <span className="accent">{target.name}</span>
      </h1>
      <p className="muted">
        Search Wikipedia for anyone — real, fictional, historical, or meme.
      </p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="e.g. Ada Lovelace, SpongeBob, Guy Fieri…"
        autoFocus
      />
      {error && <p className="error">{error}</p>}
      {searching && <p className="muted">Searching…</p>}
      {results && results.length === 0 && !searching && (
        <p className="muted">No results — try a different search.</p>
      )}
      {results && results.length > 0 && (
        <ul className="results">
          {results.map((result) => (
            <li key={result.title}>
              <button className="result" onClick={() => setSelected(result)}>
                {result.thumbnailUrl ? (
                  <img src={result.thumbnailUrl} alt="" />
                ) : (
                  <span className="thumb-placeholder">?</span>
                )}
                <span className="result-text">
                  <span className="result-title">{result.title}</span>
                  {result.description && (
                    <span className="result-desc">{result.description}</span>
                  )}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
