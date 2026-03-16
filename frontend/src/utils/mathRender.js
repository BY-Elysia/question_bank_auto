import katex from 'katex'

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function renderPlainText(text) {
  return escapeHtml(text).replace(/\r?\n/g, '<br />')
}

function renderMathExpression(expression, displayMode) {
  try {
    return katex.renderToString(String(expression || '').trim(), {
      displayMode,
      throwOnError: false,
      strict: 'ignore',
      output: 'html',
      trust: false,
    })
  } catch {
    return `<span class="math-error">${renderPlainText(expression)}</span>`
  }
}

function tokenizeMathSegments(text) {
  const pattern = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\\\([\s\S]+?\\\)|\$[^$\n]+?\$)/g
  const segments = []
  let cursor = 0
  let match = pattern.exec(text)

  while (match) {
    if (match.index > cursor) {
      segments.push({ type: 'text', value: text.slice(cursor, match.index) })
    }
    segments.push({ type: 'math', value: match[0] })
    cursor = match.index + match[0].length
    match = pattern.exec(text)
  }

  if (cursor < text.length) {
    segments.push({ type: 'text', value: text.slice(cursor) })
  }

  return segments
}

function unwrapMathDelimiters(token) {
  if (token.startsWith('$$') && token.endsWith('$$')) {
    return { value: token.slice(2, -2), displayMode: true }
  }
  if (token.startsWith('\\[') && token.endsWith('\\]')) {
    return { value: token.slice(2, -2), displayMode: true }
  }
  if (token.startsWith('\\(') && token.endsWith('\\)')) {
    return { value: token.slice(2, -2), displayMode: false }
  }
  if (token.startsWith('$') && token.endsWith('$')) {
    return { value: token.slice(1, -1), displayMode: false }
  }
  return { value: token, displayMode: false }
}

export function renderLatexHtml(text) {
  const source = String(text || '')
  if (!source.trim()) {
    return ''
  }

  return tokenizeMathSegments(source)
    .map((segment) => {
      if (segment.type === 'text') {
        return renderPlainText(segment.value)
      }
      const { value, displayMode } = unwrapMathDelimiters(segment.value)
      return renderMathExpression(value, displayMode)
    })
    .join('')
}
