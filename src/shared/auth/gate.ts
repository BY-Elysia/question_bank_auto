import { randomBytes, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';
export interface AccessConfig {
  username: string;
  passwordHash: string;
  secure: boolean;
}
export function accessConfig(): AccessConfig | undefined {
  if (!process.env.ACCESS_PASSWORD_HASH) {
    if (process.env.ACCESS_REQUIRED === '1') throw new Error('ACCESS_PASSWORD_HASH is required');
    return;
  }
  if (!/^[a-f0-9]{32}:[a-f0-9]{64}$/.test(process.env.ACCESS_PASSWORD_HASH))
    throw new Error('Invalid access password hash');
  return {
    username: process.env.ACCESS_USERNAME ?? 'admin',
    passwordHash: process.env.ACCESS_PASSWORD_HASH,
    secure: process.env.ACCESS_SECURE_COOKIE !== '0',
  };
}
export function hashPassword(password: string, salt = randomBytes(16).toString('hex')) {
  return `${salt}:${scryptSync(password, salt, 32).toString('hex')}`;
}
export function accessGate(config?: AccessConfig) {
  const sessions = new Map<string, number>();
  const failures = new Map<string, { count: number; until: number }>();
  const digest = (v: string) => createHash('sha256').update(v).digest('hex');
  const cookie = (req: Request) =>
    req.headers.cookie
      ?.split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('textbook_session='))
      ?.slice(17) ?? '';
  const reject = (res: Response, status: number, detail: string) =>
    res.status(status).json({ status, detail });
  return (req: Request, res: Response, next: NextFunction) => {
    if (!config) {
      if (req.path === '/api/access/session')
        return res.json({ enabled: false, authenticated: true });
      return next();
    }
    const pathname = req.path.toLowerCase();
    const protectedApi = /^\/api(?:\/|$)/i.test(req.path);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    const now = Date.now();
    for (const [key, expiry] of sessions) if (expiry <= now) sessions.delete(key);
    for (const [key, value] of failures) if (value.until <= now) failures.delete(key);
    const token = cookie(req),
      key = digest(token);
    const authenticated = !!token && sessions.has(key);
    const publicSession = pathname === '/api/access/session' && req.method === 'GET';
    const login = pathname === '/api/access/login' && req.method === 'POST';
    const logout = pathname === '/api/access/logout' && req.method === 'POST';
    if (protectedApi) res.setHeader('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.headers.origin) {
      const origin = req.headers.origin;
      // Proxy must preserve Host; no trust in arbitrary X-Forwarded-* headers.
      if (origin !== `${config.secure ? 'https' : 'http'}://${req.headers.host}`)
        return reject(res, 403, '请求来源不匹配');
    }
    if (publicSession) return res.json({ enabled: true, authenticated });
    if (login) {
      res.setHeader('Cache-Control', 'no-store');
      const ip = req.socket.remoteAddress ?? 'unknown';
      const failure = failures.get(ip);
      if (failure && failure.count >= 8) return reject(res, 429, '尝试次数过多，请 15 分钟后重试');
      const body = req.body as { username?: unknown; password?: unknown } | undefined;
      const password = body?.password;
      let valid = false;
      if (typeof password === 'string' && password.length <= 256) {
        const [salt, expected] = config.passwordHash.split(':');
        const calculated = scryptSync(password, salt!, 32);
        const stored = Buffer.from(expected!, 'hex');
        valid =
          stored.length === calculated.length &&
          timingSafeEqual(stored, calculated) &&
          body?.username === config.username;
      }
      if (!valid) {
        if (failures.size >= 1000 && !failure) failures.delete(failures.keys().next().value!);
        failures.set(ip, {
          count: (failure?.count ?? 0) + 1,
          until: failure?.until ?? now + 900000,
        });
        return reject(res, 401, '账号或密码错误');
      }
      failures.delete(ip);
      sessions.delete(key);
      if (sessions.size >= 100) sessions.delete(sessions.keys().next().value!);
      const fresh = randomBytes(32).toString('hex');
      sessions.set(digest(fresh), now + 43200000);
      res.setHeader(
        'Set-Cookie',
        `textbook_session=${fresh}; Path=/; HttpOnly; SameSite=Strict; Max-Age=43200${config.secure ? '; Secure' : ''}`,
      );
      return res.json({ authenticated: true });
    }
    if (logout) {
      sessions.delete(key);
      res.setHeader(
        'Set-Cookie',
        `textbook_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secure ? '; Secure' : ''}`,
      );
      return res.status(204).end();
    }
    if (pathname === '/api/health' && req.method === 'GET' && !authenticated)
      return res.json({ status: 'ok' });
    if (protectedApi && !authenticated) return reject(res, 401, '请先登录');
    return next();
  };
}
