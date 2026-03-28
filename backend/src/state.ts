import { createClient } from 'redis'
import {
  REDIS_URL,
  SESSION_STORE_PREFIX,
  SESSION_TTL_SECONDS,
} from './config'
import type {
  ChapterSessionState,
  ExamQuestionSessionState,
  ExamSessionState,
  QuestionSessionState,
} from './types'

type SessionKind = 'chapter' | 'question' | 'exam' | 'exam-question'

const chapterSessions = new Map<string, ChapterSessionState>()
const questionSessions = new Map<string, QuestionSessionState>()
const examSessions = new Map<string, ExamSessionState>()
const examQuestionSessions = new Map<string, ExamQuestionSessionState>()

const storeMap: Record<SessionKind, Map<string, unknown>> = {
  chapter: chapterSessions,
  question: questionSessions,
  exam: examSessions,
  'exam-question': examQuestionSessions,
}

type SessionRedisClient = ReturnType<typeof createClient>

let redisClientPromise: Promise<SessionRedisClient | null> | null = null
let redisRetryAfter = 0
let missingRedisWarned = false
let redisFailureWarned = false

function logMissingRedisOnce() {
  if (missingRedisWarned || REDIS_URL) {
    return
  }
  missingRedisWarned = true
  console.warn('[session-store] REDIS_URL is not configured, falling back to in-memory session storage.')
}

function logRedisFailureOnce(message: string) {
  if (!redisFailureWarned) {
    console.warn(`[session-store] Redis unavailable, falling back to in-memory session storage. ${message}`)
    redisFailureWarned = true
  }
}

async function getRedisClient() {
  if (!REDIS_URL) {
    logMissingRedisOnce()
    return null
  }

  if (redisRetryAfter > Date.now()) {
    return null
  }

  if (!redisClientPromise) {
    redisClientPromise = (async () => {
      try {
        const client = createClient({
          url: REDIS_URL,
          socket: {
            reconnectStrategy: false,
          },
        })
        client.on('error', (error) => {
          logRedisFailureOnce(error instanceof Error ? error.message : String(error))
        })
        await client.connect()
        redisRetryAfter = 0
        redisFailureWarned = false
        return client
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        logRedisFailureOnce(message)
        redisRetryAfter = Date.now() + 30_000
        redisClientPromise = null
        return null
      }
    })()
  }

  return redisClientPromise
}

function getMemoryStore<T>(kind: SessionKind) {
  return storeMap[kind] as Map<string, T>
}

function sessionKey(kind: SessionKind, sessionId: string) {
  return `${SESSION_STORE_PREFIX}:${kind}:${sessionId}`
}

async function getSession<T>(kind: SessionKind, sessionId: string): Promise<T | null> {
  const memoryStore = getMemoryStore<T>(kind)
  const client = await getRedisClient()
  if (!client) {
    return memoryStore.get(sessionId) ?? null
  }

  try {
    const raw = await client.get(sessionKey(kind, sessionId))
    if (!raw) {
      return memoryStore.get(sessionId) ?? null
    }
    const parsed = JSON.parse(raw) as T
    memoryStore.set(sessionId, parsed)
    return parsed
  } catch (error) {
    logRedisFailureOnce(error instanceof Error ? error.message : String(error))
    redisRetryAfter = Date.now() + 30_000
    redisClientPromise = null
    return memoryStore.get(sessionId) ?? null
  }
}

async function setSession<T>(kind: SessionKind, sessionId: string, value: T) {
  const memoryStore = getMemoryStore<T>(kind)
  memoryStore.set(sessionId, value)

  const client = await getRedisClient()
  if (!client) {
    return
  }

  try {
    const payload = JSON.stringify(value)
    if (SESSION_TTL_SECONDS > 0) {
      await client.set(sessionKey(kind, sessionId), payload, {
        EX: SESSION_TTL_SECONDS,
      })
      return
    }
    await client.set(sessionKey(kind, sessionId), payload)
  } catch (error) {
    logRedisFailureOnce(error instanceof Error ? error.message : String(error))
    redisRetryAfter = Date.now() + 30_000
    redisClientPromise = null
  }
}

export async function getChapterSession(sessionId: string) {
  return getSession<ChapterSessionState>('chapter', sessionId)
}

export async function setChapterSession(sessionId: string, value: ChapterSessionState) {
  await setSession('chapter', sessionId, value)
}

export async function getQuestionSession(sessionId: string) {
  return getSession<QuestionSessionState>('question', sessionId)
}

export async function setQuestionSession(sessionId: string, value: QuestionSessionState) {
  await setSession('question', sessionId, value)
}

export async function getExamSession(sessionId: string) {
  return getSession<ExamSessionState>('exam', sessionId)
}

export async function setExamSession(sessionId: string, value: ExamSessionState) {
  await setSession('exam', sessionId, value)
}

export async function getExamQuestionSession(sessionId: string) {
  return getSession<ExamQuestionSessionState>('exam-question', sessionId)
}

export async function setExamQuestionSession(sessionId: string, value: ExamQuestionSessionState) {
  await setSession('exam-question', sessionId, value)
}
