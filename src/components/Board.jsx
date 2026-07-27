import { useEffect, useRef, useState } from 'react'
import {
  castVote,
  passTurn,
  retractVote,
  setRoomStatus,
  submitGuessResult,
} from '../lib/room'
import { imageUrl, openExternal, useSpeaking } from '../discord'
import { wikiUrl } from '../lib/wikipedia'
import { getVolume, setVolume, sfx } from '../sounds'

const MAJORITY_TOTAL_MS = 10000 // 5s grace + 5s visible countdown
const UNANIMOUS_MS = 3000 // short countdown so misclicks stay undoable
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

  const [celebrate, setCelebrate] = useState(false)
  const [muted, setMuted] = useState(getVolume() <= 0)
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
      const timer = setTimeout(() => setRoomStatus(roomCode, 'reveal'), 2500)
      return () => clearTimeout(timer)
    }
  }, [room.status, everyoneGuessed, roomCode])

  // Everyone except the card's owner who is still connected gets a vote.
  function eligibleVoters(targetId) {
    return players
      .filter(([id, p]) => id !== targetId && p.connected !== false)
      .map(([id]) => id)
  }

  function voteTally(targetId) {
    const votes = room.players?.[targetId]?.votes ?? {}
    const voters = eligibleVoters(targetId)
    return { cast: voters.filter((id) => votes[id]).length, needed: voters.length }
  }

  // Reveal timing, derived identically on every client from shared vote
  // state: unanimity → short countdown; strict majority → grace then
  // countdown; dropping below majority cancels.
  const deadlinesRef = useRef({})
  useEffect(() => {
    players.forEach(([id, p]) => {
      const active = room.status === 'playing' && !p.hasGuessed
      const tally = voteTally(id)
      if (!active || tally.cast === 0 || tally.needed === 0) {
        delete deadlinesRef.current[id]
        return
      }
      const unanimous = tally.cast === tally.needed
      const majority = tally.cast * 2 > tally.needed
      if (unanimous) {
        deadlinesRef.current[id] = Math.min(
          deadlinesRef.current[id] ?? Infinity,
          Date.now() + UNANIMOUS_MS,
        )
      } else if (majority) {
        deadlinesRef.current[id] ??= Date.now() + MAJORITY_TOTAL_MS
      } else {
        delete deadlinesRef.current[id]
      }
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  function countdownFor(id) {
    const deadline = deadlinesRef.current[id]
    if (deadline === undefined) return null
    const remaining = deadline - now
    if (remaining > COUNTDOWN_MS || remaining <= 0) return null
    return Math.ceil(remaining / 1000)
  }

  // The card owner's client applies the result once their deadline passes.
  const myDeadline =
    me && !me.hasGuessed ? deadlinesRef.current[playerId] : undefined
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

  // --- Sound cues, driven by diffs of shared state ---
  const soundPrevRef = useRef(null)
  useEffect(() => {
    const prev = soundPrevRef.current
    const next = { votes: {}, guessed: {}, turn: currentTurnId }
    let voteOpened = false
    let revealed = false
    players.forEach(([id, p]) => {
      next.votes[id] = Object.keys(p.votes ?? {}).length
      next.guessed[id] = Boolean(p.hasGuessed)
      if (prev) {
        if (next.votes[id] > 0 && (prev.votes[id] ?? 0) === 0) voteOpened = true
        if (next.guessed[id] && !prev.guessed[id]) revealed = true
      }
    })
    if (prev) {
      if (revealed) sfx.reveal()
      else if (voteOpened) sfx.vote()
      if (
        rotating &&
        currentTurnId === playerId &&
        prev.turn !== playerId &&
        prev.turn != null
      ) {
        sfx.yourTurn()
      }
    }
    soundPrevRef.current = next
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [room])

  const tickPrevRef = useRef({})
  useEffect(() => {
    let ticked = false
    const current = {}
    players.forEach(([id]) => {
      const c = countdownFor(id)
      current[id] = c
      if (c !== null && c !== tickPrevRef.current[id]) ticked = true
    })
    tickPrevRef.current = current
    if (ticked) sfx.tick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [now])

  function toggleMute() {
    if (muted) {
      setVolume(0.6)
      setMuted(false)
      sfx.vote()
    } else {
      setVolume(0)
      setMuted(true)
    }
  }

  const myTally = me && !me.hasGuessed ? voteTally(playerId) : null

  return (
    <main className="shell shell-wide">
      <button className="sound-btn" onClick={toggleMute} aria-label="toggle sound">
        {muted ? '🔇' : '🔊'}
      </button>
      <h1>Namedrop</h1>
      <p className="muted">
        Ask yes/no questions out loud. When someone says the right answer,
        vote ✓ on their card.
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

      {myTally && myTally.cast > 0 && (
        <div className="vote-bar">
          <span>
            {countdownFor(playerId) !== null
              ? `⏳ Revealing your card in ${countdownFor(playerId)}…`
              : `🗳️ The group thinks you've got it (${myTally.cast}/${myTally.needed})`}
          </span>
        </div>
      )}

      <div className="board">
        {players.map(([id, player]) => {
          const isMe = id === playerId
          // Hide your own card until the group confirms your guess.
          const hidden = isMe && !player.hasGuessed
          const isTurn = rotating && id === currentTurnId && !player.hasGuessed
          const isSpeaking = player.discordId && speaking.has(player.discordId)
          const votable = room.status === 'playing' && !player.hasGuessed && !isMe
          const myVote = Boolean((player.votes ?? {})[playerId])
          const tally = votable || isMe ? voteTally(id) : null
          const countdown = !player.hasGuessed ? countdownFor(id) : null
          const accent = player.color ?? '#23a55a'
          const style = {}
          if (player.color) style.borderTop = `5px solid ${player.color}`
          if (isSpeaking) {
            // speaking ring matches the player's chosen color
            style.outline = `3px solid ${accent}`
            style.boxShadow = `0 0 16px ${accent}66`
          }
          return (
            <div
              key={id}
              className={`card ${hidden ? 'card-mystery' : ''} ${isTurn && !isSpeaking ? 'card-turn' : ''}`}
              style={style}
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
                {!hidden && player.character?.title && (
                  <button
                    className="wiki-link"
                    onClick={() => openExternal(wikiUrl(player.character.title))}
                  >
                    Wikipedia ↗
                  </button>
                )}
                {player.hasGuessed && (
                  <div className={player.correct ? 'result-badge win' : 'result-badge lose'}>
                    {player.correct ? `✓ got it ${ordinal(player.order)}` : '✗ missed'}
                  </div>
                )}
                {countdown !== null && (
                  <div className="vote-note">⏳ revealing in {countdown}…</div>
                )}
                {votable && countdown === null && (
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
                        onClick={() => castVote(roomCode, id, playerId)}
                      >
                        ✓ got it{tally.cast > 0 ? ` (${tally.cast}/${tally.needed})` : '?'}
                      </button>
                    </div>
                  )
                )}
              </div>
            </div>
          )
        })}
      </div>

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
