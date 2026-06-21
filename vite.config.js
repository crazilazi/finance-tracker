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

export default defineConfig({
  plugins: [
    react(),
    {
      name: 'save-data-plugin',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url === '/api/get-expenses' && req.method === 'GET') {
            try {
              const data = await dbProvider.getExpenses(dbConfig, __dirname);
              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(data));
            } catch (err) {
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: err.message }));
            }
          } else if (req.url === '/api/save-expenses' && req.method === 'POST') {
            let body = '';
            req.on('data', chunk => {
              body += chunk.toString();
            });
            req.on('end', async () => {
              try {
                const payload = JSON.parse(body);
                await dbProvider.saveExpenses(dbConfig, payload, __dirname);
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
