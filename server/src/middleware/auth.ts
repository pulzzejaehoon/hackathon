import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  console.warn('[Auth] Missing JWT_SECRET. Set it in your server environment.');
}

// Extend Express Request to carry user
declare global {
  namespace Express {
    interface Request {
      user?: { userId: number; email: string };
    }
  }
}

export const authMiddleware = (req: Request, res: Response, next: NextFunction) => {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');

    if (scheme !== 'Bearer' || !token) {
      return res.status(401).json({ message: 'Unauthorized: No token provided' });
    }

    const decoded = jwt.verify(token, String(JWT_SECRET)) as any;
    if (!decoded?.email || !decoded?.userId) {
      return res.status(401).json({ message: 'Unauthorized: Invalid token payload' });
    }

    req.user = { userId: decoded.userId, email: decoded.email };
    next();
  } catch (err) {
    return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
  }
};
