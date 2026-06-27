export default function handler(req, res) {
  if (req.method === 'POST') {
    res.setHeader('Set-Cookie', 'auth_session=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax');
    res.status(200).json({ success: true });
  } else {
    res.setHeader('Allow', ['POST']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
