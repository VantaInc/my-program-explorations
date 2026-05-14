const REPO   = 'VantaInc/my-program-explorations'
const BRANCH = 'sigs'
const PATH   = 'signatures.json'
const RAW    = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${PATH}`

async function readSigs(token) {
  // Try raw URL first (fast, cached)
  const r = await fetch(RAW + '?bust=' + Date.now())
  if (r.ok) {
    const data = await r.json()
    return data
  }
  // Fallback: GitHub contents API (initialises if file missing)
  const metaRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  )
  if (!metaRes.ok) return { signatures: [] }
  const { content } = await metaRes.json()
  return JSON.parse(Buffer.from(content, 'base64').toString('utf8'))
}

async function writeSigs(token, data) {
  // Get current SHA
  const metaRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PATH}?ref=${BRANCH}`,
    { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } }
  )
  let sha
  if (metaRes.ok) {
    const meta = await metaRes.json()
    sha = meta.sha
  }

  const body = {
    message: `sigs: update`,
    content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
    branch: BRANCH
  }
  if (sha) body.sha = sha

  const putRes = await fetch(
    `https://api.github.com/repos/${REPO}/contents/${PATH}`,
    {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    }
  )
  if (!putRes.ok) {
    const err = await putRes.json().catch(() => ({}))
    throw new Error(`GitHub write failed: ${putRes.status} ${JSON.stringify(err)}`)
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  const token = process.env.GITHUB_TOKEN
  if (!token) return res.status(500).json({ error: 'GITHUB_TOKEN not set' })

  // ── GET ──
  if (req.method === 'GET') {
    try {
      const data = await readSigs(token)
      return res.status(200).json(data)
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── POST ──
  if (req.method === 'POST') {
    const { name } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    try {
      const data = await readSigs(token)
      const newSig = { name, created_at: new Date().toISOString() }
      data.signatures.push(newSig)
      await writeSigs(token, data)
      return res.status(200).json(newSig) // return server-created sig so client syncs timestamp
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── DELETE ──
  if (req.method === 'DELETE') {
    const { name, created_at } = req.body || {}
    if (!name || !created_at) return res.status(400).json({ error: 'name and created_at required' })
    try {
      const data = await readSigs(token)
      const before = data.signatures.length
      data.signatures = data.signatures.filter(
        s => !(s.name === name && s.created_at === created_at)
      )
      if (data.signatures.length === before) {
        return res.status(404).json({ error: 'signature not found' })
      }
      await writeSigs(token, data)
      return res.status(200).json({ ok: true })
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  return res.status(405).json({ error: 'method not allowed' })
}
