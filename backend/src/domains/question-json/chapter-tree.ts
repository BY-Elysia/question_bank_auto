import type { ChapterItem, TextbookJsonPayload } from '../../types'

export function normalizeTitle(value: string) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .trim()
}

function normalizeDigits(value: string) {
  return String(value || '').replace(/[０-９]/g, (char) =>
    String.fromCharCode(char.charCodeAt(0) - 0xff10 + 0x30),
  )
}

function parseNumericSuffix(value: string, pattern: RegExp) {
  const match = value.match(pattern)
  return match ? Number(match[1]) : 0
}

function parseChineseNumberToken(rawToken: string) {
  const token = String(rawToken || '').trim()
  if (!token) return 0
  if (/^\d+$/.test(token)) return Number(token)
  const map: Record<string, number> = {
    零: 0,
    一: 1,
    二: 2,
    两: 2,
    三: 3,
    四: 4,
    五: 5,
    六: 6,
    七: 7,
    八: 8,
    九: 9,
  }
  let total = 0
  let current = 0
  for (const ch of token) {
    if (map[ch] !== undefined) {
      current = map[ch]
      continue
    }
    if (ch === '十') {
      total += (current || 1) * 10
      current = 0
      continue
    }
    if (ch === '百') {
      total += (current || 1) * 100
      current = 0
      continue
    }
    if (ch === '千') {
      total += (current || 1) * 1000
      current = 0
      continue
    }
  }
  return total + current
}

function extractChapterNoFromTitle(titleInput: string) {
  const title = normalizeDigits(normalizeTitle(titleInput))
  const digitMatch = title.match(/第\s*(\d+)\s*章/)
  if (digitMatch?.[1]) return Number(digitMatch[1])
  const zhMatch = title.match(/第\s*([零一二两三四五六七八九十百千]+)\s*章/)
  if (zhMatch?.[1]) return parseChineseNumberToken(zhMatch[1])
  return 0
}

function extractSectionSuffixFromTitle(titleInput: string) {
  const title = normalizeDigits(normalizeTitle(titleInput))
  const explicit = title.match(/(\d+)\s*[._．。]\s*(\d+)/)
  if (explicit?.[1] && explicit?.[2]) {
    return { chapterNo: Number(explicit[1]), sectionNo: Number(explicit[2]) }
  }
  return { chapterNo: 0, sectionNo: 0 }
}

export function ensureTopChapter(payload: TextbookJsonPayload, titleInput: string): ChapterItem {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find((item) => item.parentId === null && normalizeTitle(item.title) === title)
  if (existing) {
    return existing
  }
  const topItems = payload.chapters.filter((item) => item.parentId === null)
  const maxOrder = topItems.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const maxIdNum = topItems.reduce((max, item) => Math.max(max, parseNumericSuffix(item.chapterId, /^ch_(\d+)$/)), 0)
  const parsedChapterNo = extractChapterNoFromTitle(title)
  const chapterNo = parsedChapterNo > 0 ? parsedChapterNo : maxIdNum + 1
  const created: ChapterItem = {
    chapterId: `ch_${chapterNo}`,
    parentId: null,
    title,
    orderNo: parsedChapterNo > 0 ? parsedChapterNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}

export function ensureSectionChapter(
  payload: TextbookJsonPayload,
  parentChapterId: string,
  titleInput: string,
): ChapterItem {
  const title = normalizeTitle(titleInput)
  const existing = payload.chapters.find(
    (item) => item.parentId === parentChapterId && normalizeTitle(item.title) === title,
  )
  if (existing) {
    return existing
  }
  const siblings = payload.chapters.filter((item) => item.parentId === parentChapterId)
  const maxOrder = siblings.reduce((max, item) => Math.max(max, Number(item.orderNo) || 0), 0)
  const chapterNo = parseNumericSuffix(parentChapterId, /^ch_(\d+)$/) || 1
  const siblingPattern = new RegExp(`^ch_${chapterNo}_(\\d+)$`)
  const maxSiblingNo = siblings.reduce((max, item) => Math.max(max, parseNumericSuffix(item.chapterId, siblingPattern)), 0)
  const parsedSection = extractSectionSuffixFromTitle(title)
  const sectionNo =
    parsedSection.chapterNo === chapterNo && parsedSection.sectionNo > 0
      ? parsedSection.sectionNo
      : maxSiblingNo + 1
  const created: ChapterItem = {
    chapterId: `ch_${chapterNo}_${sectionNo}`,
    parentId: parentChapterId,
    title,
    orderNo: parsedSection.chapterNo === chapterNo && parsedSection.sectionNo > 0 ? parsedSection.sectionNo : maxOrder + 1,
  }
  payload.chapters.push(created)
  return created
}
