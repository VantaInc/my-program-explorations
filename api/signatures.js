const REPO   = 'VantaInc/my-program-explorations'
const BRANCH = 'main'
const PATH   = 'signatures.json'
const RAW    = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN env var not set' })

  // GET — return current signatures
  if (req.method === 'GET') {
    const r = await fetch(RAW + '?bust=' + Date.now())
    if (!r.ok) return res.status(500).json({ error: 'read failed' })
    const data = await r.json()
    return res.status(200).json(data)
  }

  // POST — append a new signature
  if (req.method === 'POST') {
    const { name } = req.body
    if (!name) return res.status(400).json({ error: 'name required' })

    // Get current file + SHA
    const metaRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
    )
    if (!metaRes.ok) return res.status(500).json({ error: 'could not read file metadata' })
    const { sha, content } = await metaRes.json()
    const current = JSON.parse(Buffer.from(content, 'base64').toString('utf8'))

    // Append
    const newSig = { name, created_at: new Date().toISOString() }
    current.signatures.push(newSig)

    // Write back
    const putRes = await fetch(
      `https://api.github.com/repos/${REPO}/contents/${PATH}`,
      {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          message: `sig: ${name}`,
          content: Buffer.from(JSON.stringify(current, null, 2)).toString('base64'),
          sha,
          branch: BRANCH
        })
      }
    )
    if (!putRes.ok) return res.status(500).json({ error: 'write failed' })

    return res.status(200).json(newSig)
  }

  return res.status(405).json({ error: 'method not allowed' })
}
