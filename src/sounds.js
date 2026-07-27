// All sound effects are synthesized with the Web Audio API — no audio
// files, nothing to license, nothing for Discord's sandbox to block.

const VOLUME_KEY = 'namedrop:sfx'

let ctx = null

function ensure() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {})
  return ctx
}

// Browsers only allow audio after a user gesture; warm the context up on
// the first interaction so later game-driven sounds are allowed to play.
window.addEventListener('pointerdown', () => ensure(), { once: true })

export function getVolume() {
  const v = parseFloat(localStorage.getItem(VOLUME_KEY))
  return Number.isFinite(v) ? v : 0.6
}

export function setVolume(v) {
  localStorage.setItem(VOLUME_KEY, String(v))
}

function tone(freq, start, dur, { type = 'sine', peak = 0.22 } = {}) {
  const c = ensure()
  if (!c) return
  const vol = getVolume()
  if (vol <= 0) return
  const osc = c.createOscillator()
  const gain = c.createGain()
  osc.type = type
  osc.frequency.value = freq
  const t = c.currentTime + start
  gain.gain.setValueAtTime(0.0001, t)
  gain.gain.exponentialRampToValueAtTime(peak * vol, t + 0.02)
  gain.gain.exponentialRampToValueAtTime(0.0001, t + dur)
  osc.connect(gain).connect(c.destination)
  osc.start(t)
  osc.stop(t + dur + 0.05)
}

export const sfx = {
  // someone opened voting on a card
  vote() {
    tone(660, 0, 0.12, { type: 'triangle' })
    tone(880, 0.09, 0.15, { type: 'triangle', peak: 0.16 })
  },
  // reveal countdown tick
  tick() {
    tone(1040, 0, 0.06, { type: 'square', peak: 0.07 })
  },
  // a card flipped
  reveal() {
    ;[523, 659, 784, 1047].forEach((f, i) =>
      tone(f, i * 0.09, 0.25, { type: 'triangle', peak: 0.18 }),
    )
  },
  // it's your turn to ask
  yourTurn() {
    tone(587, 0, 0.12)
    tone(880, 0.12, 0.2, { peak: 0.16 })
  },
  // end of round
  roundOver() {
    ;[392, 523, 659, 784, 1047].forEach((f, i) =>
      tone(f, i * 0.11, 0.3, { type: 'triangle', peak: 0.16 }),
    )
  },
}
