export default function handler(req, res) {
  const cookieStr = req.headers.cookie;
  if (!cookieStr) {
    return res.status(200).json({ authenticated: false });
  }

  const match = cookieStr.match(/auth_session=([^;]+)/);
  if (match) {
    try {
      const user = JSON.parse(decodeURIComponent(match[1]));
      return res.status(200).json({
        authenticated: true,
        username: user.username,
        email: user.email,
      });
    } catch (e) {
      return res.status(200).json({ authenticated: false });
    }
  }

  res.status(200).json({ authenticated: false });
}
