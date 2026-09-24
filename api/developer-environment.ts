import type { Request, Response, NextFunction } from 'express'
export type DeveloperEnvironment = 'live' | 'test'
export class DeveloperEnvironmentError extends Error { constructor(readonly status: number, message: string) { super(message) } }
function fail(status: number, message: string): never { throw new DeveloperEnvironmentError(status, message) }
export function developerEnvironment(value: unknown, fallback?: DeveloperEnvironment): DeveloperEnvironment {
  if (value === undefined && fallback) return fallback
  if (value !== 'live' && value !== 'test') fail(400, 'Environment must be exactly live or test.')
  return value
}
// An environment hint never grants access or switches a provider. Keys remain authoritative.
export function assertLiveDeveloperRequest(req: Pick<Request, 'headers'> & Partial<Pick<Request, 'body' | 'query'>>) {
  const values = [req.body?.environment, req.query?.environment, req.headers['x-hashpaylink-environment']].filter(value => value !== undefined)
  const environments = values.map(value => developerEnvironment(value))
  const credentials = [req.headers['x-api-key'], req.headers.authorization].filter(value => value !== undefined)
  if (credentials.some(value => /(?:^|\s)hpl_test_/.test(String(value)))) fail(403, 'Sandbox credentials cannot access live payment routes.')
  if (environments.some(value => value === 'test')) fail(409, 'Sandbox execution is not enabled on this route. No live operation was started.')
}
export function developerEnvironmentBoundary(req: Request, res: Response, next: NextFunction) {
  try { assertLiveDeveloperRequest(req); next() }
  catch (error) { const failure = error as Error & { status?: number }; return res.status(failure.status ?? 400).json({ ok: false, error: failure.message }) }
}
