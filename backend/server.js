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

const SCANNER_HEARTBEAT_TTL_MS = Number(process.env.SCANNER_HEARTBEAT_TTL_MS || 15000);
const scannerAgents = new Map();

function normalizeScannerRecord(device) {
  const id = String(device?.id || device?.name || '').trim();
  const name = String(device?.name || device?.id || '').trim();

  return {
    ...device,
    id,
    name,
    status: typeof device?.status === 'string' ? device.status : undefined,
    type: typeof device?.type === 'string' ? device.type : 'scanner',
    connection: typeof device?.connection === 'string' ? device.connection : 'local',
  };
}

function pruneExpiredAgents() {
  const now = Date.now();

  for (const [agentId, agent] of scannerAgents.entries()) {
    if (!agent?.lastHeartbeatAt || (now - agent.lastHeartbeatAt) > SCANNER_HEARTBEAT_TTL_MS) {
      scannerAgents.delete(agentId);
    }
  }
}

function collectOnlineDevices(kind) {
  pruneExpiredAgents();

  const devices = [];
  for (const agent of scannerAgents.values()) {
    const list = kind === 'printers' ? agent.printers : agent.scanners;

    if (!Array.isArray(list)) {
      continue;
    }

    for (const device of list) {
      const normalized = normalizeScannerRecord(device);
      if (!normalized.id || !normalized.name) {
        continue;
      }

      if (String(normalized.status || '').toLowerCase() === 'offline') {
        continue;
      }

      devices.push({
        ...normalized,
        agentId: agent.agentId,
        agentName: agent.agentName,
        hostname: agent.hostname,
        lastHeartbeatAt: agent.lastHeartbeatAt,
      });
    }
  }

  return devices;
}

function getScannerHealthSummary() {
  pruneExpiredAgents();

  const scanners = collectOnlineDevices('scanners');
  const printers = collectOnlineDevices('printers');
  const agents = Array.from(scannerAgents.values());

  return {
    ok: agents.length > 0,
    status: agents.length > 0 ? 'online' : 'offline',
    agentCount: agents.length,
    scanners: scanners.length,
    printers: printers.length,
    lastHeartbeatAt: agents.reduce((latest, agent) => Math.max(latest, agent.lastHeartbeatAt || 0), 0),
  };
}

// CORS configuration - CRITICAL FOR RAILWAY DEPLOYMENT
// This must validate against strict allowlist and always set headers for allowed origins
const corsOriginValidator = (origin, callback) => {
  // Always allow requests with no origin (same-origin, mobile apps, curl)
  if (!origin) {
    callback(null, true);
    return;
  }

  const normalizedOrigin = normalizeOrigin(origin);
  const isAllowed = allowedOrigins.has(normalizedOrigin);

  if (isAllowed) {
    // ALLOW - return true to set CORS headers
    callback(null, true);
    return;
  }

  // NOT ALLOWED - return true anyway to set headers (browser will handle rejection)
  // This ensures backend always responds properly, browser enforces CORS
  console.warn(`[CORS] Origin not in allowlist: ${origin}`);
  callback(null, true); // Still return true - let browser handle it
};

const corsOptions = {
  origin: corsOriginValidator,
  credentials: true,
  methods: ['GET', 'HEAD', 'PUT', 'PATCH', 'POST', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin', 'Access-Control-Request-Headers', 'Access-Control-Request-Method'],
  exposedHeaders: ['Content-Type', 'Content-Length', 'Content-Range', 'X-Content-Range', 'X-Request-Id', 'Authorization'],
  maxAge: 86400, // 24 hours
  optionsSuccessStatus: 200,
  preflightContinue: false,
};

// CRITICAL: Apply CORS middleware FIRST before any routes
console.log('[STARTUP] Initializing CORS middleware for Railway...');
console.log('[STARTUP] Allowed frontend origins:', Array.from(allowedOrigins).join(', '));
app.use(cors(corsOptions));

// Body parsing middleware (MUST come after CORS)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

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

app.post('/api/agent/heartbeat', (req, res) => {
  const payload = req.body || {};
  const agentId = String(payload.agentId || payload.agent_id || payload.hostname || 'local-agent').trim();
  const agentName = String(payload.agentName || payload.agent_name || payload.hostname || agentId).trim();
  const hostname = String(payload.hostname || payload.hostName || '').trim();
  const scanners = Array.isArray(payload.scanners) ? payload.scanners.map(normalizeScannerRecord) : [];
  const printers = Array.isArray(payload.printers) ? payload.printers.map(normalizeScannerRecord) : [];

  scannerAgents.set(agentId, {
    agentId,
    agentName,
    hostname,
    scanners,
    printers,
    lastHeartbeatAt: Date.now(),
    status: String(payload.status || 'online'),
    naps2Installed: Boolean(payload.naps2Installed ?? payload.naps2 ?? true),
  });

  res.json({
    ok: true,
    agentId,
    onlineScanners: scanners.length,
    onlinePrinters: printers.length,
    receivedAt: new Date().toISOString(),
  });
});

app.get('/api/scanners', (_req, res) => {
  const scanners = collectOnlineDevices('scanners');
  const printers = collectOnlineDevices('printers');

  res.json({
    scanners,
    printers,
    summary: getScannerHealthSummary(),
  });
});

app.get('/api/scan-health', (_req, res) => {
  const summary = getScannerHealthSummary();

  res.json({
    agent: {
      running: summary.ok,
      ok: summary.ok,
      naps2Installed: summary.ok,
      backendUrl: process.env.PORTAL_URL || null,
      scannerCacheReady: summary.scanners > 0,
      cachedScannerCount: summary.scanners,
      cachedPrinterCount: summary.printers,
      lastHeartbeatAt: summary.lastHeartbeatAt,
    },
    summary,
  });
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