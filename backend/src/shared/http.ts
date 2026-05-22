import type { NextFunction, Request, RequestHandler, Response } from 'express'

export type ErrorStatusResolver = (error: unknown) => number

export function getErrorMessage(error: unknown) {
  return error instanceof Error ? error.message : String(error)
}

export function readQueryString(value: unknown) {
  return typeof value === 'string' ? value : ''
}

export function sendJsonSuccess(res: Response, payload: Record<string, unknown> = {}) {
  return res.json({
    message: 'success',
    ...payload,
  })
}

export function sendJsonError(
  res: Response,
  error: unknown,
  context: string,
  resolveStatus: ErrorStatusResolver = () => 500,
) {
  const message = `${context}: ${getErrorMessage(error)}`
  return res.status(resolveStatus(error)).json({ message })
}

export function asyncRoute(
  handler: (req: Request, res: Response, next: NextFunction) => Promise<unknown> | unknown,
): RequestHandler {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next)
  }
}
