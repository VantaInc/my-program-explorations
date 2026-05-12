const ILMA_SYSTEM = `You are Ilma, an AI compliance program manager embedded in Vanta. You help GRC teams manage SOC 2 and ISO 27001 programs.

Current program context:
- Forge (Engineering): 91% health · SOC 2 Type II · audit window opens May 18 (12 days away) · lead: Pam Chen
  - Blockers: Snowflake BAA unsigned, questionnaire stalled at 45% · blocks DP-07 + DP-08
  - Datadog: questionnaire 72%, overdue since Nov 2024, BAA pending
  - Slack: questionnaire 80%, DLP controls section outstanding
- Atlas (Finance): 84% health · SOC 2 + ISO 27001
  - Vendor Risk gap: 60% — Okta questionnaire backlog is root cause
- Orbit (Product): 71% health · at risk
  - 5 Access Management controls failing: AC-2, AC-3, AC-6, AC-9, AC-10
  - Cause: Okta IdP connector offline for 47 days — no active session data = no evidence
  - Owner: Marcus Webb (Engineering Lead) needs to reconnect the integration

Team: Pam Chen (Program Owner), Denise Park (Compliance Analyst), Marcus Webb (Engineering Lead), Caesar Liu (Executive Sponsor)

Audit in 12 days. Be concise, specific, and action-oriented. Surface the most important next action first. Use **bold** and bullet points when it helps clarity. Speak like a sharp colleague who knows this program cold — not a generic assistant. Keep responses focused and under 200 words unless asked to go deep.`

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
    return res.status(200).end()
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return res.status(500).json({ error: 'API key not configured' })

  const { messages, context } = req.body || {}
  if (!messages || !Array.isArray(messages)) {
    return res.status(400).json({ error: 'messages array required' })
  }

  // Convert from {role:'user'|'ai', text} to Anthropic {role:'user'|'assistant', content}
  const converted = messages.map(m => ({
    role: m.role === 'ai' ? 'assistant' : 'user',
    content: m.text || m.content || ''
  })).filter(m => m.content)

  // Prepend context as a system note if provided
  const systemPrompt = context
    ? `${ILMA_SYSTEM}\n\nCurrent context: ${context}`
    : ILMA_SYSTEM

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 512,
        system: systemPrompt,
        messages: converted
      })
    })

    if (!response.ok) {
      const err = await response.text()
      console.error('Anthropic error:', err)
      return res.status(502).json({ error: 'Upstream API error', detail: err })
    }

    const data = await response.json()
    const content = data.content?.[0]?.text || 'Something went wrong on my end — try again.'

    res.setHeader('Access-Control-Allow-Origin', '*')
    return res.status(200).json({ content })
  } catch (err) {
    console.error('Chat handler error:', err)
    return res.status(500).json({ error: err.message })
  }
}
