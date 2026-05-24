import type { Response } from 'express'

function writeNdjson(res: Response, payload: Record<string, unknown>) {
  res.write(`${JSON.stringify(payload)}\n`)
}

export { writeNdjson }
