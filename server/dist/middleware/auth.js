import jwt from 'jsonwebtoken';
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    console.error('[Auth] CRITICAL: Missing JWT_SECRET. Set it in your server environment.');
    console.error('[Auth] Application security is compromised without a proper JWT secret.');
    process.exit(1);
}
export const authMiddleware = (req, res, next) => {
    try {
        const header = req.headers.authorization || '';
        const [scheme, token] = header.split(' ');
        if (scheme !== 'Bearer' || !token) {
            return res.status(401).json({ message: 'Unauthorized: No token provided' });
        }
        const decoded = jwt.verify(token, String(JWT_SECRET));
        if (!decoded?.email || !decoded?.userId) {
            return res.status(401).json({ message: 'Unauthorized: Invalid token payload' });
        }
        req.user = { userId: decoded.userId, email: decoded.email };
        next();
    }
    catch (err) {
        return res.status(401).json({ message: 'Unauthorized: Invalid or expired token' });
    }
};
