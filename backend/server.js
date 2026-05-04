const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://dms-frontend-production-0d65.up.railway.app';
const DATABASE_URL = process.env.DATABASE_URL;
const normalizeOrigin = (origin) => String(origin || '').replace(/\/+$/, '').toLowerCase();
const extraOrigins = String(process.env.CORS_ORIGINS || '')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);
const allowedOrigins = new Set([
  'http://localhost:5173',
  'http://127.0.0.1:5173',
  'https://documentmanagementsystem-production-9d6e.up.railway.app',
  'https://dms-frontend-production-0d65.up.railway.app',
  FRONTEND_URL,
  ...extraOrigins,
].map(normalizeOrigin));

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

app.use(cors({
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }

    const normalizedOrigin = normalizeOrigin(origin);
    if (allowedOrigins.has(normalizedOrigin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}. Allowed: ${Array.from(allowedOrigins).join(', ')}`));
  },
  credentials: true,
}));
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'Railway deployment server is running',
  });
});

app.get('/api/test', async (_req, res) => {
  try {
    const result = await pool.query('SELECT NOW() AS now');
    res.json({
      ok: true,
      message: 'API is working',
      database: 'connected',
      timestamp: result.rows[0].now,
    });
  } catch (error) {
    console.error('Database test route failed:', error);
    res.status(500).json({
      ok: false,
      message: 'API is running but database connection failed',
    });
  }
});

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, status: 'healthy' });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(500).json({ ok: false, status: 'unhealthy' });
  }
});

async function start() {
  try {
    await pool.query('SELECT 1');
    console.log('PostgreSQL connected');

    app.listen(PORT, () => {
      console.log(`Server listening on port ${PORT}`);
      console.log(`Allowed frontend origins: ${Array.from(allowedOrigins).join(', ')}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;
module.exports.pool = pool;