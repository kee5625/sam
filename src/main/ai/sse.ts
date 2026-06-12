export function parseSseBuffer(buf: string): { events: string[]; rest: string } {
  const normalized = buf.replace(/\r\n/g, '\n')
  const parts = normalized.split('\n\n')
  const rest = parts.pop() ?? ''
  const events: string[] = []
  for (const part of parts) {
    for (const line of part.split('\n')) {
      if (!line.startsWith('data: ')) continue
      const payload = line.slice(6).trim()
      if (payload && payload !== '[DONE]') events.push(payload)
    }
  }
  return { events, rest }
}

export function extractDelta(eventJson: string): string | null {
  try {
    const j = JSON.parse(eventJson)
    return j?.choices?.[0]?.delta?.content ?? null
  } catch {
    return null
  }
}
