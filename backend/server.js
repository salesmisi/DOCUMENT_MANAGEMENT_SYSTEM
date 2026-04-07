const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config();

const app = express();
const PORT = Number(process.env.PORT) || 5000;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
  console.error('DATABASE_URL is required.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

app.use(cors({
  origin: FRONTEND_URL,
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
      console.log(`Allowed frontend origin: ${FRONTEND_URL}`);
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
}

start();

module.exports = app;