import { signSession } from '../../../lib/auth';

export default async function handler(req, res) {
  const { code, username: mockUsername, email: mockEmail } = req.query;
  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;

  let finalUsername = mockUsername;
  let finalEmail = mockEmail;

  if (clientId && clientSecret && code) {
    try {
      // 1. Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
        }),
      });

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;

      if (!accessToken) {
        throw new Error('Failed to retrieve access token from GitHub');
      }

      // 2. Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const userData = await userResponse.json();
      finalUsername = userData.login;
      
      // Attempt to get email if available
      finalEmail = userData.email || `${userData.login}@github.com`;

    } catch (err) {
      console.error('GitHub OAuth Error:', err);
      return res.status(500).send('Authentication failed');
    }
  }

  try {
    const token = signSession({ username: finalUsername, email: finalEmail });

    // Set the cookie
    const cookieOptions = [
      'Path=/',
      'HttpOnly',
      'Max-Age=86400',
      'SameSite=Lax',
    ];
    
    const cookieHeader = `auth_session=${token}; ${cookieOptions.join('; ')}`;
    res.setHeader('Set-Cookie', cookieHeader);
    res.redirect('/');
  } catch (err) {
    console.error('Session signing error:', err);
    res.status(500).send('Internal Server Error: Authentication misconfigured.');
  }
}
