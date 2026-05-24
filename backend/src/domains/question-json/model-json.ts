function extractFirstJsonObject(rawText: string) {
  const direct = rawText.trim()
  if (direct.startsWith('{') && direct.endsWith('}')) {
    return direct
  }
  const fenced = rawText.match(/```json\s*([\s\S]*?)\s*```/i) || rawText.match(/```\s*([\s\S]*?)\s*```/i)
  if (fenced?.[1]) {
    return fenced[1].trim()
  }
  const first = rawText.indexOf('{')
  const last = rawText.lastIndexOf('}')
  if (first !== -1 && last !== -1 && first < last) {
    return rawText.slice(first, last + 1).trim()
  }
  return ''
}

function fixInvalidJsonEscapes(input: string) {
  // Keep valid JSON escapes, only escape invalid backslash sequences such as "\l", "\s", "\q".
  return input.replace(/\\(?!["\\/bfnrtu])/g, '\\\\')
}

function removeTrailingCommas(input: string) {
  return input.replace(/,\s*([}\]])/g, '$1')
}

function sanitizeJsonStringContent(input: string) {
  let output = ''
  let inString = false

  for (let i = 0; i < input.length; i += 1) {
    const ch = input[i]

    if (!inString) {
      output += ch
      if (ch === '"') {
        inString = true
      }
      continue
    }

    if (ch === '"') {
      output += ch
      inString = false
      continue
    }

    if (ch === '\\') {
      const next = input[i + 1] || ''
      if (/["\\/bfnrt]/.test(next)) {
        output += `\\${next}`
        i += 1
        continue
      }
      if (next === 'u') {
        const hex = input.slice(i + 2, i + 6)
        if (/^[0-9a-fA-F]{4}$/.test(hex)) {
          output += `\\u${hex}`
          i += 5
          continue
        }
      }
      output += '\\\\'
      continue
    }

    if (ch === '\n') {
      output += '\\n'
      continue
    }
    if (ch === '\r') {
      output += '\\r'
      continue
    }
    if (ch === '\t') {
      output += '\\t'
      continue
    }

    const code = ch.charCodeAt(0)
    if (code < 0x20) {
      output += ' '
      continue
    }
    output += ch
  }

  return output
}

function parseModelJsonObject(jsonText: string) {
  const candidates = [
    jsonText,
    fixInvalidJsonEscapes(jsonText),
    removeTrailingCommas(jsonText),
    removeTrailingCommas(fixInvalidJsonEscapes(jsonText)),
    sanitizeJsonStringContent(jsonText),
    removeTrailingCommas(sanitizeJsonStringContent(jsonText)),
    sanitizeJsonStringContent(removeTrailingCommas(fixInvalidJsonEscapes(jsonText))),
  ]
  const errors: string[] = []

  for (const candidate of candidates) {
    try {
      return JSON.parse(candidate) as Record<string, unknown>
    } catch (error) {
      errors.push(error instanceof Error ? error.message : String(error))
    }
  }

  const preview = jsonText.slice(0, 600)
  throw new Error(`Model JSON parse failed. ${errors.join(' | ')}; preview=${preview}`)
}

export { extractFirstJsonObject, parseModelJsonObject }
