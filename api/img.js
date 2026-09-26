// Image relay for Discord activities. Wikimedia moved scaled thumbnails to
// thumb.wikimedia.org (Sept 2026), and adding hosts to a Discord activity
// requires portal URL-mapping changes — routing images through our own
// deployment instead means future host changes only need a code deploy.
const ALLOWED = /^https:\/\/(upload|thumb)\.wikimedia\.org\//

module.exports = async (req, res) => {
  const src = req.query?.src
  if (!src || !ALLOWED.test(src)) {
    res.status(400).json({ error: 'bad src' })
    return
  }
  try {
    const upstream = await fetch(src, {
      headers: {
        'User-Agent':
          'Namedrop/1.0 (party game; github.com/LethalNoah/namedrop)',
      },
    })
    if (!upstream.ok) {
      res.status(upstream.status).end()
      return
    }
    const buf = Buffer.from(await upstream.arrayBuffer())
    res.setHeader('Content-Type', upstream.headers.get('content-type') ?? 'image/jpeg')
    res.setHeader('Cache-Control', 'public, max-age=86400, immutable')
    res.status(200).send(buf)
  } catch {
    res.status(502).json({ error: 'fetch failed' })
  }
}
