import { useEffect, useRef, useState } from 'react'
import {
  cancelGuessVote,
  castVote,
  passTurn,
  requestGuessVote,
  setRoomStatus,
  submitGuessResult,
} from '../lib/room'
import { imageUrl, useSpeaking } from '../discord'

export default function Board({ room, roomCode, playerId }) {
  const players = Object.entries(room.players ?? {}).sort(
    ([, a], [, b]) => (a.joinedAt ?? 0) - (b.joinedAt ?? 0),
  )
  const me = room.players?.[playerId]
  const rotating = room.turnOrder === 'rotating'
  const currentTurnId = rotating ? room.currentTurn : null
  const myTurn = currentTurnId === playerId
  const speaking = useSpeaking()

  const [confirmOpen, setConfirmOpen] = useState(false)
  const [celebrate, setCelebrate] = useState(false)
  const submittingRef = useRef(false)

  // When the last player has guessed, flip the room to the reveal screen.
  // Disconnected players don't block the end of the round.
  const everyoneGuessed =
    players.length > 0 &&
    players.some(([, p]) => p.hasGuessed) &&
    players.every(([, p]) => p.hasGuessed || p.connected === false)
  useEffect(() => {
    if (room.status === 'playing' && everyoneGuessed) {
      // Small delay so the last winner gets a moment with their card
      // before every screen jumps to the round-over view.
      const timer = setTimeout(() => setRoomStatus(roomCode, 'reveal'), 2500)
      return () => clearTimeout(timer)
    }
  }, [room.status, everyoneGuessed, roomCode])

  // Everyone except the guesser who is still connected gets a vote.
  function eligibleVoters(guesserId) {
    return players
      .filter(([id, p]) => id !== guesserId && p.connected !== false)
      .map(([id]) => id)
  }

  function voteTally(guesserId) {
    const votes = room.players?.[guesserId]?.votes ?? {}
    const voters = eligibleVoters(guesserId)
    return { cast: voters.filter((id) => votes[id]).length, needed: voters.length }
  }

  // The guesser's own client applies the unanimous result: card flips,
  // finish order assigned, turn passes on.
  const myVoteDone =
    me?.pendingGuess && !me.hasGuessed &&
    eligibleVoters(playerId).every((id) => (me.votes ?? {})[id])
  useEffect(() => {
    if (!myVoteDone || submittingRef.current) return
    submittingRef.current = true
    ;(async () => {
      const finishedCount = players.filter(([, p]) => p.correct).length
      await submitGuessResult(roomCode, playerId, true, finishedCount + 1)
      if (rotating && myTurn) {
        await passTurn(roomCode, room.players, playerId)
      }
      setCelebrate(true)
      submittingRef.current = false
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [myVoteDone])

  const pendingTally = me?.pendingGuess ? voteTally(playerId) : null

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
          {(myTurn || room.players[currentTurnId].connected === false) && (
            <button onClick={() => passTurn(roomCode, room.players, currentTurnId)}>
              Pass turn
            </button>
          )}
        </div>
      )}

      {pendingTally && !me.hasGuessed && (
        <div className="vote-bar">
          <span>
            🗳️ Waiting for the group to confirm… ({pendingTally.cast}/
            {pendingTally.needed})
          </span>
          <button onClick={() => cancelGuessVote(roomCode, playerId)}>
            Withdraw
          </button>
        </div>
      )}

      <div className="board">
        {players.map(([id, player]) => {
          const isMe = id === playerId
          // Hide your own card until the group confirms your guess.
          const hidden = isMe && !player.hasGuessed
          const isTurn = rotating && id === currentTurnId && !player.hasGuessed
          const isSpeaking = player.discordId && speaking.has(player.discordId)
          const claiming = player.pendingGuess && !player.hasGuessed
          const myVote = claiming ? Boolean((player.votes ?? {})[playerId]) : false
          const tally = claiming ? voteTally(id) : null
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
                {claiming && !isMe && (
                  myVote ? (
                    <div className="vote-note">
                      you voted ✓ ({tally.cast}/{tally.needed})
                    </div>
                  ) : (
                    <div className="vote-row">
                      <button
                        className="vote-yes"
                        onClick={() => castVote(roomCode, id, playerId, true)}
                      >
                        ✓ right
                      </button>
                      <button
                        className="vote-no"
                        onClick={() => castVote(roomCode, id, playerId, false)}
                      >
                        ✗ nope
                      </button>
                    </div>
                  )
                )}
                {claiming && isMe && (
                  <div className="vote-note">
                    🗳️ {tally.cast}/{tally.needed} confirmed
                  </div>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {me && !me.hasGuessed && !me.pendingGuess && (
        // In take-turns mode you can only call it on your own turn
        <button
          className="primary"
          disabled={rotating && !myTurn}
          onClick={() => setConfirmOpen(true)}
        >
          {rotating && !myTurn ? "I've got it! (wait for your turn)" : "I've got it!"}
        </button>
      )}

      {confirmOpen && me && (
        <div className="modal-backdrop" onClick={() => setConfirmOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <h2>Say your guess out loud!</h2>
            <p className="muted">
              Tell everyone who you think you are — then ask for votes. If the
              whole group confirms it, your card flips.
            </p>
            <button
              className="primary"
              onClick={() => {
                requestGuessVote(roomCode, playerId)
                setConfirmOpen(false)
              }}
            >
              Ask for votes
            </button>
            <button className="ghost" onClick={() => setConfirmOpen(false)}>
              Never mind
            </button>
          </div>
        </div>
      )}

      {celebrate && me && (
        <div className="modal-backdrop">
          <div className="modal">
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
            <button className="primary" onClick={() => setCelebrate(false)}>
              Back to the board
            </button>
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
