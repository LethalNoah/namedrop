import { useState } from 'react'
import { startGame } from '../lib/room'
import { imageUrl } from '../discord'

export default function RevealScreen({ room, roomCode, playerId }) {
  const [error, setError] = useState(null)
  const isHost = room.hostId === playerId

  const players = Object.entries(room.players ?? {}).sort(([, a], [, b]) => {
    if (a.correct && b.correct) return (a.order ?? 99) - (b.order ?? 99)
    if (a.correct) return -1
    if (b.correct) return 1
    return (a.joinedAt ?? 0) - (b.joinedAt ?? 0)
  })

  async function handlePlayAgain() {
    try {
      await startGame(roomCode)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <main className="shell">
      <h1>🎉 Round over!</h1>
      <ul className="reveal-list">
        {players.map(([id, player]) => (
          <li key={id}>
            {player.character?.thumbnailUrl ? (
              <img src={imageUrl(player.character.thumbnailUrl)} alt="" />
            ) : (
              <span className="thumb-placeholder">?</span>
            )}
            <span className="reveal-text">
              <span className="reveal-player">
                {player.name}
                {id === playerId && ' (you)'}
              </span>
              <span className="reveal-character">
                was {player.character?.title ?? '—'}
              </span>
            </span>
            <span
              className={
                player.correct
                  ? 'result-badge win'
                  : player.hasGuessed
                    ? 'result-badge lose'
                    : 'result-badge'
              }
            >
              {player.correct ? medal(player.order) : player.hasGuessed ? '✗' : '—'}
            </span>
          </li>
        ))}
      </ul>
      {isHost ? (
        <button className="primary" onClick={handlePlayAgain}>
          Play another round
        </button>
      ) : (
        <p className="muted">Waiting for the host to start another round…</p>
      )}
      {error && <p className="error">{error}</p>}
    </main>
  )
}

function medal(order) {
  return { 1: '🥇', 2: '🥈', 3: '🥉' }[order] ?? `#${order}`
}
