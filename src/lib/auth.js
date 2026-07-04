import jwt from 'jsonwebtoken';

const JWT_SECRET = process.env.JWT_SECRET;

export function signSession(payload) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '1d' });
}

export function verifySession(token) {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured.');
  }
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

export function getSessionUser(req) {
  const cookieStr = req.headers.cookie;
  if (!cookieStr) return null;
  const match = cookieStr.match(/auth_session=([^;]+)/);
  if (match) {
    return verifySession(match[1]);
  }
  return null;
}
