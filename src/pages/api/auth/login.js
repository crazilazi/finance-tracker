export default function handler(req, res) {
  const clientId = process.env.GITHUB_CLIENT_ID;

  if (clientId) {
    // Real GitHub OAuth
    const redirectUri = encodeURIComponent(`http://localhost:3000/api/auth/callback`);
    const githubAuthUrl = `https://github.com/login/oauth/authorize?client_id=${clientId}&redirect_uri=${redirectUri}&scope=read:user user:email`;
    res.redirect(githubAuthUrl);
  } else {
    // Fallback to Mock Auth if no client ID is provided
    res.setHeader('Content-Type', 'text/html');
    res.status(200).send(`
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Mock Auth - Finance Tracker</title>
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap" rel="stylesheet">
        <style>
          body { margin: 0; font-family: 'Inter', sans-serif; background: #0b0f19; color: white; display: flex; align-items: center; justify-content: center; height: 100vh; }
          .card { background: #151b2b; border-radius: 16px; padding: 32px; width: 100%; max-width: 400px; text-align: center; }
          .app-icon { width: 48px; height: 48px; border-radius: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); display: flex; align-items: center; justify-content: center; font-size: 24px; margin: 0 auto 16px; }
          input { width: 100%; padding: 10px; margin-bottom: 16px; border-radius: 8px; border: 1px solid #232e4c; background: #0b0f19; color: white; }
          button { width: 100%; padding: 12px; border-radius: 8px; border: none; background: #6366f1; color: white; cursor: pointer; }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="app-icon">₹</div>
          <h2>Mock OAuth 2.0 Authorization</h2>
          <form action="/api/auth/callback" method="GET">
            <input type="text" name="username" value="crazilazi" required>
            <input type="email" name="email" value="crazilazi@example.com" required>
            <button type="submit">Authorize Access</button>
          </form>
        </div>
      </body>
      </html>
    `);
  }
}
