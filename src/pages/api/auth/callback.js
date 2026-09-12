import {
  signSession,
  serializeCookie,
  parseCookies,
  safeEqual,
  SESSION_COOKIE,
  OAUTH_STATE_COOKIE,
  SESSION_MAX_AGE,
} from '../../../lib/auth';
import * as dbProvider from '../../../lib/db/dbProvider';
import { dbConfig } from '../../../lib/db/config';

const MOCK_USERNAME_RE = /^[A-Za-z0-9_.-]{1,50}$/;

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    { res.status(405).end('Method Not Allowed'); return; }
  }

  const clientId = process.env.GITHUB_CLIENT_ID;
  const clientSecret = process.env.GITHUB_CLIENT_SECRET;
  const isProduction = process.env.NODE_ENV === 'production';
  const clearStateCookie = serializeCookie(OAUTH_STATE_COOKIE, '', { maxAge: 0, req });

  let profile;

  if (clientId) {
    // GitHub is configured: this is the ONLY accepted identity source.
    // Query-string usernames are never trusted on this path.
    if (!clientSecret) {
      console.error('GITHUB_CLIENT_ID is set but GITHUB_CLIENT_SECRET is missing.');
      { res.status(500).json({ error: 'Authentication is not configured.' }); return; }
    }

    const { code, state, error: providerError } = req.query;
    if (providerError) {
      res.setHeader('Set-Cookie', clearStateCookie);
      { res.status(400).send('GitHub authorization was denied.'); return; }
    }
    if (typeof code !== 'string' || !code) {
      { res.status(400).send('Missing authorization code.'); return; }
    }

    const expectedState = parseCookies(req)[OAUTH_STATE_COOKIE];
    if (!expectedState || !safeEqual(String(state || ''), expectedState)) {
      res.setHeader('Set-Cookie', clearStateCookie);
      { res.status(400).send('Invalid or expired OAuth state. Please try signing in again.'); return; }
    }

    try {
      // 1. Exchange code for access token
      const tokenResponse = await fetch('https://github.com/login/oauth/access_token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ client_id: clientId, client_secret: clientSecret, code }),
      });
      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      if (!accessToken) {
        throw new Error(tokenData.error_description || 'Failed to retrieve access token from GitHub');
      }

      // 2. Get user info
      const userResponse = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'finance-tracker',
        },
      });
      if (!userResponse.ok) {
        throw new Error(`GitHub user lookup failed with status ${userResponse.status}`);
      }
      const userData = await userResponse.json();
      if (!userData || typeof userData.login !== 'string' || userData.id === undefined || userData.id === null) {
        throw new Error('Unexpected GitHub user payload');
      }

      profile = {
        oauth_provider: 'github',
        oauth_id: String(userData.id),
        username: userData.login,
        email: userData.email || `${userData.login}@github.com`,
      };
    } catch (err) {
      console.error('GitHub OAuth error:', err);
      res.setHeader('Set-Cookie', clearStateCookie);
      { res.status(500).send('Authentication failed'); return; }
    }
  } else if (!isProduction) {
    // Mock auth: development only, and only when GitHub is NOT configured.
    const username = typeof req.query.username === 'string' ? req.query.username.trim() : '';
    const email = typeof req.query.email === 'string' ? req.query.email.trim().slice(0, 255) : '';
    if (!MOCK_USERNAME_RE.test(username)) {
      { res.status(400).send('Invalid mock username.'); return; }
    }
    profile = {
      oauth_provider: 'mock',
      oauth_id: `mock-${username}`,
      username,
      email: email || null,
    };
  } else {
    { res.status(500).json({ error: 'Authentication is not configured.' }); return; }
  }

  try {
    const dbUser = await dbProvider.verifyOrCreateUser(dbConfig, profile);

    const token = signSession({
      user_id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
    });

    res.setHeader('Set-Cookie', [
      serializeCookie(SESSION_COOKIE, token, { maxAge: SESSION_MAX_AGE, req }),
      clearStateCookie,
    ]);
    { res.redirect('/'); return; }
  } catch (err) {
    console.error('Session creation error:', err);
    { res.status(500).send('Internal Server Error: authentication misconfigured or database offline.'); return; }
  }
}