import { useEffect, useRef, useState } from 'react'
import {
  cancelGuessVote,
  castVote,
  passTurn,
  requestGuessVote,
  retractVote,
  setRoomStatus,
  submitGuessResult,
} from '../lib/room'
import { imageUrl, useSpeaking } from '../discord'

const GRACE_MS = 5000
const COUNTDOWN_MS = 5000

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

  // Ticks so vote countdowns re-render as time passes
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [])

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

  // Reveal timing: unanimous ✓ reveals immediately; a strict majority
  // starts a 5s grace + 5s visible countdown. Losing the majority (votes
  // undone) cancels the countdown. Deadlines are derived identically on
  // every client from shared vote state, so countdowns stay in sync.
  const deadlinesRef = useRef({})
  useEffect(() => {
    players.forEach(([id, p]) => {
      const claiming = p.pendingGuess && !p.hasGuessed
      if (!claiming) {
        delete deadlinesRef.current[id]
        return
      }
      const tally = voteTally(id)
      const unanimous = tally.cast === tally.needed // includes needed === 0
      const majority = tally.cast * 2 > tally.needed
      if (unanimous) {
        deadlinesRef.current[id] = 0 // immediate
      } else if (majority) {
        deadlinesRef.current[id] ??= Date.now() + GRACE_MS + COUNTDOWN_MS
      } else {
        delete deadlinesRef.current[id]
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  function countdownFor(id) {
    const deadline = deadlinesRef.current[id]
    if (deadline === undefined || deadline === 0) return null
    const remaining = deadline - now
    if (remaining > COUNTDOWN_MS || remaining <= 0) return null
    return Math.ceil(remaining / 1000)
  }

  // The guesser's own client applies the result once their deadline passes.
  const myDeadline =
    me?.pendingGuess && !me.hasGuessed ? deadlinesRef.current[playerId] : undefined
  const shouldSubmit = myDeadline !== undefined && now >= myDeadline
  useEffect(() => {
    if (!shouldSubmit || submittingRef.current) return
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
  }, [shouldSubmit])

  const pendingTally = me?.pendingGuess && !me.hasGuessed ? voteTally(playerId) : null
  const myCountdown = pendingTally ? countdownFor(playerId) : null

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

      {pendingTally && (
        <div className="vote-bar">
          <span>
            {myCountdown !== null
              ? `⏳ Revealing in ${myCountdown}…`
              : `🗳️ Waiting for the group to confirm… (${pendingTally.cast}/${pendingTally.needed})`}
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
          const countdown = claiming ? countdownFor(id) : null
          return (
            <div
              key={id}
              className={`card ${hidden ? 'card-mystery' : ''} ${isTurn ? 'card-turn' : ''} ${isSpeaking ? 'speaking' : ''}`}
              style={player.color ? { borderTop: `5px solid ${player.color}` } : undefined}
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
                {claiming && countdown !== null && (
                  <div className="vote-note">⏳ revealing in {countdown}…</div>
                )}
                {claiming && countdown === null && !isMe && (
                  myVote ? (
                    <div className="vote-note">
                      you voted ✓ ({tally.cast}/{tally.needed}){' '}
                      <button
                        className="vote-undo"
                        onClick={() => retractVote(roomCode, id, playerId)}
                      >
                        undo
                      </button>
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
                {claiming && countdown === null && isMe && (
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
              group confirms it, your card flips.
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
