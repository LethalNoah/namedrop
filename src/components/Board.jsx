import { useEffect, useState } from 'react'
import { passTurn, setRoomStatus, submitGuessResult } from '../lib/room'
import { imageUrl, useSpeaking } from '../discord'

export default function Board({ room, roomCode, playerId }) {
  const players = Object.entries(room.players ?? {}).sort(
    ([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
  )
  const me = room.players?.[playerId]
  const rotating = room.turnOrder === 'rotating'
  const currentTurnId = rotating ? room.currentTurn : null
  const myTurn = currentTurnId === playerId

  // 'closed' | 'confirm' | 'flipped'
  const [revealStage, setRevealStage] = useState('closed')
  const speaking = useSpeaking()

  // When the last player has guessed, flip the room to the reveal screen.
  // Disconnected players don't block the end of the round — their card
  // stays in play, but the group isn't stuck waiting on them.
  // Any client may fire this; the write is idempotent.
  const everyoneGuessed =
    players.length > 0 &&
    players.some(([, p]) => p.hasGuessed) &&
    players.every(([, p]) => p.hasGuessed || p.connected === false)
  useEffect(() => {
    if (room.status === 'playing' && everyoneGuessed) {
      // Small delay so the last flipper gets a moment with their card
      // before every screen jumps to the round-over view.
      const timer = setTimeout(() => setRoomStatus(roomCode, 'reveal'), 2500)
      return () => clearTimeout(timer)
    }
  }, [room.status, everyoneGuessed, roomCode])

  // Flipping IS winning: the guess was already confirmed out loud by the
  // group (they can all see the card). Wrong guesses just never flip.
  async function handleFlip() {
    const finishedCount = players.filter(([, p]) => p.correct).length
    await submitGuessResult(roomCode, playerId, true, finishedCount + 1)
    if (rotating && myTurn) {
      await passTurn(roomCode, room.players, playerId)
    }
    setRevealStage('flipped')
  }

  return (
    <main className="shell shell-wide">
      <h1>Namedrop</h1>
      <p className="muted">
        Ask yes/no questions out loud to figure out who you are.
      </p>

      {rotating && currentTurnId && room.players?.[currentTurnId] && (
        <div className="turn-bar">
          <span>
            🎤 <strong>{room.players[currentTurnId].name}</strong>
            {myTurn
              ? ' — your turn to ask!'
              : room.players[currentTurnId].connected === false
                ? ' is asking (offline)'
                : ' is asking'}
          </span>
          {/* If the current asker dropped, let anyone move the game along */}
          {(myTurn || room.players[currentTurnId].connected === false) && (
            <button onClick={() => passTurn(roomCode, room.players, currentTurnId)}>
              Pass turn
            </button>
          )}
        </div>
      )}

      <div className="board">
        {players.map(([id, player]) => {
          const isMe = id === playerId
          // Hide your own card until you've flipped it; everyone else's
          // card (and all cards of finished players) are open.
          const hidden = isMe && !player.hasGuessed
          const isTurn = rotating && id === currentTurnId && !player.hasGuessed
          const isSpeaking = player.discordId && speaking.has(player.discordId)
          return (
            <div
              key={id}
              className={`card ${hidden ? 'card-mystery' : ''} ${isTurn ? 'card-turn' : ''} ${isSpeaking ? 'speaking' : ''}`}
            >
              {hidden ? (
                <div className="card-img mystery">?</div>
              ) : player.character?.thumbnailUrl ? (
                <img
                  className="card-img"
                  src={imageUrl(player.character.thumbnailUrl)}
                  alt={player.character.title}
                />
              ) : (
                <div className="card-img mystery">–</div>
              )}
              <div className="card-body">
                <div className="card-character">
                  {hidden ? '???' : player.character?.title ?? '—'}
                </div>
                <div className="card-player">
                  {player.name}
                  {isMe && ' (you)'}
                  {player.connected === false && (
                    <span className="offline-chip">offline</span>
                  )}
                </div>
                {player.hasGuessed && (
                  <div className={player.correct ? 'result-badge win' : 'result-badge lose'}>
                    {player.correct ? `✓ got it ${ordinal(player.order)}` : '✗ missed'}
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {me && !me.hasGuessed && (
        // In take-turns mode you can only call it on your own turn
        <button
          className="primary"
          disabled={rotating && !myTurn}
          onClick={() => setRevealStage('confirm')}
        >
          {rotating && !myTurn ? "I've got it! (wait for your turn)" : "I've got it!"}
        </button>
      )}

      {revealStage !== 'closed' && me && (
        <div className="modal-backdrop" onClick={() => revealStage === 'confirm' && setRevealStage('closed')}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            {revealStage === 'confirm' ? (
              <>
                <h2>Say your guess out loud!</h2>
                <p className="muted">
                  Tell everyone who you think you are. Once the group confirms
                  you've got it, flip your card to lock in your win.
                </p>
                <button className="primary" onClick={handleFlip}>
                  Flip my card
                </button>
                <button className="ghost" onClick={() => setRevealStage('closed')}>
                  Never mind
                </button>
              </>
            ) : (
              <>
                <h2>You are…</h2>
                {me.character?.thumbnailUrl && (
                  <img
                    className="modal-img"
                    src={imageUrl(me.character.thumbnailUrl)}
                    alt={me.character.title}
                  />
                )}
                <h2 className="accent">{me.character?.title}</h2>
                <p className="result-badge win">🎉 Got it {ordinal(me.order)}</p>
                <button className="primary" onClick={() => setRevealStage('closed')}>
                  Back to the board
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </main>
  )
}

function ordinal(n) {
  if (!n) return ''
  const v = n % 100
  if (v >= 11 && v <= 13) return `${n}th`
  const suffix = { 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'
  return `${n}${suffix}`
}
