import fsp from 'node:fs/promises'
import path from 'node:path'
import { LATEX_REPAIR_JSON_DIR } from './config'
import type { TextbookJsonPayload } from './types'
import { loadTextbookJson, normalizeJsonFileName } from './question-bank-service'

type RepairStats = {
  visitedTextBlockCount: number
  changedTextBlockCount: number
  changedQuestionCount: number
}

const COMMAND_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /(?<![\\A-Za-z])begin(?=\{)/g, replacement: '\\begin' },
  { pattern: /(?<![\\A-Za-z])end(?=\{)/g, replacement: '\\end' },
  { pattern: /(?<![\\A-Za-z])frac(?=\{)/g, replacement: '\\frac' },
  { pattern: /(?<![\\A-Za-z])sqrt(?=(\[|\{))/g, replacement: '\\sqrt' },
  { pattern: /(?<![\\A-Za-z])left(?=[()[\]{}|])/g, replacement: '\\left' },
  { pattern: /(?<![\\A-Za-z])right(?=[()[\]{}|])/g, replacement: '\\right' },
  { pattern: /(?<![\\A-Za-z])bigg(?=\|)/g, replacement: '\\bigg' },
  { pattern: /(?<![\\A-Za-z])big(?=\|)/g, replacement: '\\big' },
  {
    pattern:
      /(?<![\\A-Za-z])(times|cdot|rho|nu|theta|alpha|beta|gamma|delta|Delta|lambda|mu|phi|varphi|omega|Omega|sigma|Sigma|pi|sin|cos|tan|cot|sec|csc|ln|log|int|iint|iiint|sum|prod|lim|to|infty|approx|leqslant|leq|geqslant|geq|neq|mathrm|mathbf|mathbb|mathcal|operatorname|xlongequal|arcsin|arctan|text)(?=[^A-Za-z]|$)/g,
    replacement: '\\$1',
  },
]

const CONSUMED_ESCAPE_RULES: Array<{ pattern: RegExp; replacement: string }> = [
  { pattern: /\u000crac(?=\{)/g, replacement: '\\frac' },
  { pattern: /\u000corall(?=[^A-Za-z]|$)/g, replacement: '\\forall' },
  { pattern: /\u0009imes(?=[^A-Za-z]|$)/g, replacement: '\\times' },
  { pattern: /\u0009ext(?=\{)/g, replacement: '\\text' },
  { pattern: /\u0009o(?=[^A-Za-z]|$)/g, replacement: '\\to' },
  { pattern: /\u0008egin(?=\{)/g, replacement: '\\begin' },
  { pattern: /\u0008eta(?=[^A-Za-z]|$)/g, replacement: '\\beta' },
]

function buildLatexRepairFileName(sourceFileName: string, jsonFilePath: string) {
  const preferred = String(sourceFileName || '').trim()
  if (preferred) {
    return normalizeJsonFileName(preferred)
  }
  return normalizeJsonFileName(path.basename(jsonFilePath))
}

function closeUnbalancedBlockMath(text: string) {
  let output = text
  const doubleDollarCount = (output.match(/\$\$/g) || []).length
  if (doubleDollarCount % 2 === 1) {
    output = `${output}\n$$`
  }

  if (!/\$\$/.test(output) && /\\begin\{(aligned|align\*?|cases)\}/.test(output)) {
    output = `$$\n${output}\n$$`
  }

  return output
}

function repairLatexText(text: string) {
  let repaired = String(text || '')
  repaired = repaired.replace(/\r\n/g, '\n')

  for (const rule of CONSUMED_ESCAPE_RULES) {
    repaired = repaired.replace(rule.pattern, rule.replacement)
  }

  for (const rule of COMMAND_RULES) {
    repaired = repaired.replace(rule.pattern, rule.replacement)
  }

  repaired = closeUnbalancedBlockMath(repaired)
  return repaired
}

function repairTextBlock(node: unknown, stats: RepairStats) {
  if (!node || typeof node !== 'object') {
    return false
  }
  const block = node as Record<string, unknown>
  if (typeof block.text !== 'string') {
    return false
  }

  stats.visitedTextBlockCount += 1
  const nextText = repairLatexText(block.text)
  if (nextText === block.text) {
    return false
  }

  block.text = nextText
  stats.changedTextBlockCount += 1
  return true
}

function repairQuestionNode(question: unknown, stats: RepairStats) {
  if (!question || typeof question !== 'object') {
    return false
  }

  const node = question as Record<string, unknown>
  let changed = false

  if (repairTextBlock(node.prompt, stats)) {
    changed = true
  }
  if (repairTextBlock(node.standardAnswer, stats)) {
    changed = true
  }
  if (repairTextBlock(node.stem, stats)) {
    changed = true
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      if (!child || typeof child !== 'object') continue
      if (repairTextBlock((child as Record<string, unknown>).prompt, stats)) {
        changed = true
      }
      if (repairTextBlock((child as Record<string, unknown>).standardAnswer, stats)) {
        changed = true
      }
    }
  }

  if (changed) {
    stats.changedQuestionCount += 1
  }
  return changed
}

export async function repairLatexInTextbookJson(params: {
  jsonFilePath: string
  sourceFileName?: string
}) {
  const { jsonFilePath, sourceFileName = '' } = params
  const payload = await loadTextbookJson(jsonFilePath)

  const stats: RepairStats = {
    visitedTextBlockCount: 0,
    changedTextBlockCount: 0,
    changedQuestionCount: 0,
  }

  const questions = Array.isArray(payload.questions) ? payload.questions : []
  for (const question of questions) {
    repairQuestionNode(question, stats)
  }

  await fsp.mkdir(LATEX_REPAIR_JSON_DIR, { recursive: true })
  const repairedFileName = buildLatexRepairFileName(sourceFileName, jsonFilePath)
  const repairedFilePath = path.join(LATEX_REPAIR_JSON_DIR, repairedFileName)
  await fsp.writeFile(repairedFilePath, `${JSON.stringify(payload as TextbookJsonPayload, null, 2)}\n`, {
    encoding: 'utf8',
  })

  return {
    message: 'success',
    jsonFilePath,
    repairedFileName,
    repairedFilePath,
    questionCount: questions.length,
    visitedTextBlockCount: stats.visitedTextBlockCount,
    changedTextBlockCount: stats.changedTextBlockCount,
    changedQuestionCount: stats.changedQuestionCount,
  }
}
