// Verifies the same JWT issued by the FastAPI backend (backend/app/core/security.py),
// using the shared JWT_SECRET_KEY (HS256). This backend previously had zero auth on
// any route, so /api/jobs was fully public for both reading and writing, and job
// postings had no owner at all -- any company's dashboard showed every company's jobs.
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET_KEY = process.env.JWT_SECRET_KEY;
if (!JWT_SECRET_KEY) {
  throw new Error('JWT_SECRET_KEY is not set (backend-node/.env) -- must match the FastAPI backend value.');
}

export interface AuthedRequest extends Request {
  user?: { userId: string; role: string };
}

interface TokenPayload {
  sub: string; // user UUID (matches FastAPI's User.id, NOT the email)
  role: string; // 'organization' | 'student' | 'admin'
  exp: number;
}

export function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return res.status(401).json({ detail: 'Missing or invalid Authorization header' });
  }
  const token = header.slice('Bearer '.length);
  try {
    const payload = jwt.verify(token, JWT_SECRET_KEY as string) as TokenPayload;
    req.user = { userId: payload.sub, role: payload.role };
    next();
  } catch {
    return res.status(401).json({ detail: 'Could not validate credentials' });
  }
}

// Same as requireAuth, but never rejects the request -- just attaches req.user if a
// valid token is present. Used on GET /jobs so student browsing (no token) still works.
export function optionalAuth(req: AuthedRequest, _res: Response, next: NextFunction) {
  const header = req.headers.authorization;
  if (header && header.startsWith('Bearer ')) {
    const token = header.slice('Bearer '.length);
    try {
      const payload = jwt.verify(token, JWT_SECRET_KEY as string) as TokenPayload;
      req.user = { userId: payload.sub, role: payload.role };
    } catch {
      // ignore invalid token on optional routes
    }
  }
  next();
}
