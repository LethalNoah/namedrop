// Vercel serverless function: exchanges a Discord OAuth code for an access
// token. Runs server-side because it needs DISCORD_CLIENT_SECRET, which is
// set in the Vercel project's environment variables and never ships to
// browsers or the git repo.
module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'method not allowed' })
    return
  }
  try {
    const response = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: '1529563989305069648',
        client_secret: process.env.DISCORD_CLIENT_SECRET ?? '',
        grant_type: 'authorization_code',
        code: req.body?.code ?? '',
      }),
    })
    const data = await response.json()
    if (!response.ok || !data.access_token) {
      res.status(502).json({ error: 'token exchange failed' })
      return
    }
    res.status(200).json({ access_token: data.access_token })
  } catch {
    res.status(500).json({ error: 'internal error' })
  }
}
