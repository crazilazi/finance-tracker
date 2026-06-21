import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import * as dbProvider from './src/server/dbProvider.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load env configuration
const envConfig = dotenv.config({ path: path.resolve(__dirname, '.env') }).parsed || {};

const dbConfig = {
  dataSource: envConfig.DATA_SOURCE || process.env.DATA_SOURCE || 'json',
  server: envConfig.DB_SERVER || process.env.DB_SERVER || 'localhost',
  database: envConfig.DB_DATABASE || process.env.DB_DATABASE || 'GaddiTracker',
  user: envConfig.DB_USER !== undefined ? envConfig.DB_USER : (process.env.DB_USER || ''),
  password: envConfig.DB_PASSWORD !== undefined ? envConfig.DB_PASSWORD : (process.env.DB_PASSWORD || ''),
  trustServerCertificate: envConfig.DB_TRUST_SERVER_CERTIFICATE || process.env.DB_TRUST_SERVER_CERTIFICATE || 'true',
};

console.log('vite.config.js - dbConfig:', dbConfig);

const githubConfig = {
  clientId: envConfig.GITHUB_CLIENT_ID || process.env.GITHUB_CLIENT_ID || '',
  clientSecret: envConfig.GITHUB_CLIENT_SECRET || process.env.GITHUB_CLIENT_SECRET || '',
};

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-data-plugin',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
          const pathname = parsedUrl.pathname;

          // 1. Session check utility
          const getSessionUser = () => {
            const cookieHeader = req.headers.cookie || '';
            const cookies = {};
            cookieHeader.split(';').forEach(c => {
              const parts = c.trim().split('=');
              if (parts[0]) cookies[parts[0]] = parts[1];
            });
            return cookies.auth_session ? decodeURIComponent(cookies.auth_session) : null;
          };

          // 2. Auth Endpoints
          if (pathname === '/api/auth/login') {
            if (githubConfig.clientId) {
              const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${githubConfig.clientId}&redirect_uri=http://localhost:8080/api/auth/callback&scope=user:email`;
              res.writeHead(302, { Location: githubAuthUrl });
              res.end();
            } else {
              res.writeHead(302, { Location: '/mock-oauth-authorize' });
              res.end();
            }
          } 
          else if (pathname === '/api/auth/callback') {
            const code = parsedUrl.searchParams.get('code');
            let username = 'Default User';
            let email = 'default@example.com';

            if (githubConfig.clientId && githubConfig.clientSecret && code && !code.startsWith('mock_')) {
              try {
                const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
                  method: 'POST',
                  headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json',
                  },
                  body: JSON.stringify({
                    client_id: githubConfig.clientId,
                    client_secret: githubConfig.clientSecret,
                    code: code,
                  }),
                });
                const tokenData = await tokenRes.json();
                
                if (tokenData.access_token) {
                  const userRes = await fetch('https://api.github.com/user', {
                    headers: {
                      'Authorization': `Bearer ${tokenData.access_token}`,
                      'User-Agent': 'Finance-Tracker-App',
                    },
                  });
                  const userData = await userRes.json();
                  username = userData.login || userData.name || 'GitHub User';
                  email = userData.email || `${username}@github.com`;
                }
              } catch (e) {
                console.error('GitHub OAuth token exchange failed:', e.message);
              }
            } else {
              username = parsedUrl.searchParams.get('username') || 'Mock User';
              email = parsedUrl.searchParams.get('email') || `${username}@example.com`;
            }

            res.writeHead(302, {
              'Set-Cookie': `auth_session=${encodeURIComponent(username)}; Path=/; HttpOnly; Max-Age=86400`,
              Location: '/',
            });
            res.end();
          } 
          else if (pathname === '/api/auth/me') {
            const user = getSessionUser();
            if (user) {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ authenticated: true, username: user, email: `${user.toLowerCase().replace(/\s+/g, '')}@example.com` }));
            } else {
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ authenticated: false }));
            }
          } 
          else if (pathname === '/api/auth/logout' && req.method === 'POST') {
            res.writeHead(200, {
              'Set-Cookie': 'auth_session=; Path=/; HttpOnly; Max-Age=0',
              'Content-Type': 'application/json',
            });
            res.end(JSON.stringify({ success: true }));
          }
          else if (pathname === '/mock-oauth-authorize') {
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(`
              <!DOCTYPE html>
              <html lang="en">
              <head>
                <meta charset="UTF-8">
                <title>Mock OAuth 2.0 Authorization</title>
                <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
                <style>
                  body {
                    background: #0b0f19;
                    color: #f3f4f6;
                    font-family: 'Inter', sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    height: 100vh;
                    margin: 0;
                  }
                  .card {
                    background: #161d30;
                    border: 1px solid #232e4c;
                    border-radius: 16px;
                    padding: 32px;
                    width: 420px;
                    box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
                  }
                  .header {
                    text-align: center;
                    margin-bottom: 24px;
                  }
                  .app-icon {
                    width: 48px;
                    height: 48px;
                    border-radius: 12px;
                    background: linear-gradient(135deg, #6366f1, #8b5cf6);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 24px;
                    color: white;
                    margin: 0 auto 16px;
                  }
                  .title {
                    font-size: 20px;
                    font-weight: 700;
                    margin-bottom: 8px;
                  }
                  .subtitle {
                    color: #9ca3af;
                    font-size: 14px;
                  }
                  .form-group {
                    margin-bottom: 20px;
                  }
                  label {
                    display: block;
                    font-size: 13px;
                    font-weight: 600;
                    color: #9ca3af;
                    margin-bottom: 8px;
                  }
                  input {
                    width: 100%;
                    padding: 10px 14px;
                    border-radius: 8px;
                    border: 1px solid #232e4c;
                    background: #0b0f19;
                    color: white;
                    box-sizing: border-box;
                    font-size: 14px;
                  }
                  input:focus {
                    outline: none;
                    border-color: #6366f1;
                  }
                  .button-group {
                    display: flex;
                    gap: 12px;
                    margin-top: 24px;
                  }
                  button {
                    flex: 1;
                    padding: 12px;
                    border-radius: 8px;
                    border: none;
                    font-size: 14px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: background 0.2s;
                  }
                  .btn-primary {
                    background: #6366f1;
                    color: white;
                  }
                  .btn-primary:hover {
                    background: #4f46e5;
                  }
                  .btn-secondary {
                    background: #232e4c;
                    color: #9ca3af;
                  }
                  .btn-secondary:hover {
                    background: #2c3a5e;
                  }
                </style>
              </head>
              <body>
                <div class="card">
                  <div class="header">
                    <div class="app-icon">₹</div>
                    <div class="title">Mock OAuth 2.0 Authorization</div>
                    <div class="subtitle">Finance Tracker wishes to access your profile details</div>
                  </div>
                  <form action="/api/auth/callback" method="GET">
                    <input type="hidden" name="code" value="mock_code_123">
                    <div class="form-group">
                      <label for="username">Username/Profile Name</label>
                      <input type="text" id="username" name="username" value="crazilazi" required>
                    </div>
                    <div class="form-group">
                      <label for="email">Email address</label>
                      <input type="email" id="email" name="email" value="crazilazi@example.com" required>
                    </div>
                    <div class="button-group">
                      <button type="button" class="btn-secondary" onclick="window.location.href='/'">Cancel</button>
                      <button type="submit" class="btn-primary">Authorize Access</button>
                    </div>
                  </form>
                </div>
              </body>
              </html>
            `);
          }
          else if (pathname === '/api/get-expenses' && req.method === 'GET') {
            const user = getSessionUser();
            if (!user) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }
            try {
              const data = await dbProvider.getExpenses(dbConfig, __dirname, user);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          } 
          else if (pathname === '/api/save-expenses' && req.method === 'POST') {
            const user = getSessionUser();
            if (!user) {
              res.writeHead(401, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Unauthorized' }));
              return;
            }
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body);
                await dbProvider.saveExpenses(dbConfig, payload, __dirname, user);
                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: true }));
              } catch (err) {
                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({ success: false, error: err.message }));
              }
            });
          } else {
            next();
          }
        });
      }
    }
  ],
  server: {
    port: 8080,
    host: true
  }
});
