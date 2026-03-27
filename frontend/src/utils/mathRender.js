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

function renderFormattedText(text, { preserveLineBreaks = true } = {}) {
  let html = escapeHtml(text)
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>')
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
  if (preserveLineBreaks) {
    html = html.replace(/\r?\n/g, '<br />')
  }
  return html
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

function renderDisplayMathLine(line) {
  const trimmed = String(line || '').trim()
  if (!trimmed) {
    return ''
  }

  const match = trimmed.match(/^(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\])\s*([（(]\d+(?:\.\d+)*[)）])?\s*$/)
  if (!match?.[1]) {
    return ''
  }

  const { value, displayMode } = unwrapMathDelimiters(match[1])
  if (!displayMode) {
    return ''
  }

  const numberText = String(match[2] || '').trim()
  return [
    '<div class="equation-row">',
    `<div class="equation-row__math">${renderMathExpression(value, true)}</div>`,
    `<span class="equation-row__number">${escapeHtml(numberText)}</span>`,
    '</div>',
  ].join('')
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

function renderRichInlineHtml(text, { preserveLineBreaks = true } = {}) {
  return tokenizeMathSegments(String(text || ''))
    .map((segment) => {
      if (segment.type === 'text') {
        return renderFormattedText(segment.value, { preserveLineBreaks })
      }
      const { value, displayMode } = unwrapMathDelimiters(segment.value)
      return renderMathExpression(value, displayMode)
    })
    .join('')
}

export function renderRichTextHtml(text) {
  const source = String(text || '').replace(/\r\n?/g, '\n').trim()
  if (!source) {
    return ''
  }

  const blocks = []
  let paragraphLines = []
  let listLines = []
  let orderedListLines = []

  const flushParagraph = () => {
    if (!paragraphLines.length) return
    blocks.push(`<p>${renderRichInlineHtml(paragraphLines.join('\n'))}</p>`)
    paragraphLines = []
  }

  const flushList = () => {
    if (!listLines.length) return
    blocks.push(
      `<ul>${listLines
        .map((line) => line.replace(/^\s*[-*]\s+/, ''))
        .map((line) => `<li>${renderRichInlineHtml(line, { preserveLineBreaks: false })}</li>`)
        .join('')}</ul>`,
    )
    listLines = []
  }

  const flushOrderedList = () => {
    if (!orderedListLines.length) return
    blocks.push(
      `<ol>${orderedListLines
        .map((line) => line.replace(/^\s*\d+\.\s+/, ''))
        .map((line) => `<li>${renderRichInlineHtml(line, { preserveLineBreaks: false })}</li>`)
        .join('')}</ol>`,
    )
    orderedListLines = []
  }

  for (const rawLine of source.split('\n')) {
    const line = rawLine.trim()

    if (!line) {
      flushParagraph()
      flushList()
      flushOrderedList()
      continue
    }

    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/)
    if (headingMatch) {
      flushParagraph()
      flushList()
      flushOrderedList()
      const level = Math.min(6, headingMatch[1].length)
      blocks.push(`<h${level}>${renderRichInlineHtml(headingMatch[2], { preserveLineBreaks: false })}</h${level}>`)
      continue
    }

    const displayMathLineHtml = renderDisplayMathLine(rawLine)
    if (displayMathLineHtml) {
      flushParagraph()
      flushList()
      flushOrderedList()
      blocks.push(displayMathLineHtml)
      continue
    }

    if (/^\s*[-*]\s+/.test(rawLine)) {
      flushParagraph()
      flushOrderedList()
      listLines.push(rawLine)
      continue
    }

    if (/^\s*\d+\.\s+/.test(rawLine)) {
      flushParagraph()
      flushList()
      orderedListLines.push(rawLine)
      continue
    }

    flushList()
    flushOrderedList()
    paragraphLines.push(rawLine)
  }

  flushParagraph()
  flushList()
  flushOrderedList()

  return blocks.join('')
}
