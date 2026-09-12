import { getSessionUser } from '../../../lib/auth';

export default function handler(req, res) {
  const user = getSessionUser(req);
  if (user) {
    { res.status(200).json({
      authenticated: true,
      username: user.username,
      email: user.email,
    }); return; }
  }

  res.status(200).json({ authenticated: false });
}
