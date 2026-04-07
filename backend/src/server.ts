import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import bcrypt from 'bcrypt';
import { connectDB } from './db';
import fs from 'fs';

dotenv.config();

const app = express();
const FRONTEND_URL = process.env.FRONTEND_URL || 'https://documentmanagementsystem-production-9d6e.up.railway.app';
const allowedOrigins = new Set([
  'http://localhost:5173',
  'https://documentmanagementsystem-production-9d6e.up.railway.app',
  FRONTEND_URL,
]);

// Middleware
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.has(origin)) {
      callback(null, true);
      return;
    }

    callback(new Error(`CORS blocked for origin: ${origin}`));
  },
  credentials: true,
}));
app.use(express.json());

// Ensure uploads directory exists
const uploadsDir = path.join(process.cwd(), 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Serve uploaded files statically
app.use('/uploads', express.static(uploadsDir));

app.get('/', (_req, res) => res.send('API is running'));

// Auto-migration: ensure schema is up to date
async function runMigrations() {
  const client = await (await import('./db')).default.connect();
  try {
    const safeQuery = async (sql: string, label: string) => {
      try {
        await client.query(sql);
      } catch (err: any) {
        console.warn(`Migration warning [${label}]:`, err?.message || err);
      }
    };

    // Ensure UUID functions are available first
    await client.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto`);
    await client.query(`CREATE EXTENSION IF NOT EXISTS "uuid-ossp"`);

    // Ensure core tables exist before running ALTER statements against them.
    await client.query(`
      CREATE TABLE IF NOT EXISTS departments (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(100) NOT NULL UNIQUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        description TEXT,
        folder_path TEXT,
        code VARCHAR(10)
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(150) NOT NULL,
        email VARCHAR(255) NOT NULL UNIQUE,
        password VARCHAR(255) NOT NULL,
        role VARCHAR(20) NOT NULL DEFAULT 'staff' CHECK (role IN ('admin','manager','staff')),
        department VARCHAR(100) NOT NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','trashed')),
        avatar TEXT,
        trashed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS folders (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        name VARCHAR(255) NOT NULL,
        parent_id UUID REFERENCES folders(id) ON DELETE CASCADE,
        department VARCHAR(100) NOT NULL,
        is_department BOOLEAN NOT NULL DEFAULT FALSE,
        created_by VARCHAR(150) NOT NULL,
        created_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        created_by_role VARCHAR(20) NOT NULL CHECK (created_by_role IN ('admin','manager','staff')),
        visibility VARCHAR(20) NOT NULL DEFAULT 'department' CHECK (visibility IN ('private','department','admin-only')),
        permissions TEXT[] DEFAULT '{}',
        status VARCHAR(20) DEFAULT 'active',
        trashed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS documents (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title VARCHAR(255) NOT NULL,
        department VARCHAR(100),
        department_id UUID REFERENCES departments(id) ON DELETE SET NULL,
        reference VARCHAR(100),
        date DATE NOT NULL DEFAULT CURRENT_DATE,
        uploaded_by VARCHAR(150) NOT NULL,
        uploaded_by_id UUID REFERENCES users(id) ON DELETE SET NULL,
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected','archived','trashed')),
        version INT NOT NULL DEFAULT 1,
        file_type VARCHAR(10),
        size VARCHAR(50),
        folder_id UUID REFERENCES folders(id) ON DELETE CASCADE,
        needs_approval BOOLEAN NOT NULL DEFAULT TRUE,
        approved_by VARCHAR(150),
        rejection_reason TEXT,
        metadata JSONB DEFAULT '{}',
        is_encrypted BOOLEAN NOT NULL DEFAULT FALSE,
        retention_days INT,
        trashed_at TIMESTAMPTZ,
        archived_at TIMESTAMPTZ,
        trashed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        tags TEXT[] DEFAULT '{}',
        description TEXT,
        scanned_from VARCHAR(100),
        file_data BYTEA,
        file_path TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name VARCHAR(150) NOT NULL,
        user_role VARCHAR(20) NOT NULL,
        action VARCHAR(100) NOT NULL,
        target VARCHAR(255) NOT NULL,
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('document','folder','user','system')),
        ip_address VARCHAR(45),
        details TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type VARCHAR(50) NOT NULL DEFAULT 'approval',
        title VARCHAR(255) NOT NULL,
        message TEXT NOT NULL,
        document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
        is_read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await client.query(`
      CREATE TABLE IF NOT EXISTS notification_preferences (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
        email_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        browser_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        approvals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id)`, 'notification_preferences user index');

    await client.query(`
      CREATE TABLE IF NOT EXISTS document_shared_users (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role VARCHAR(20) NOT NULL DEFAULT 'viewer',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(document_id, user_id)
      )
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_document_shared_users_document ON document_shared_users(document_id)`, 'document_shared_users document index');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_document_shared_users_user ON document_shared_users(user_id)`, 'document_shared_users user index');

    // Fix departments table: ensure id has a UUID default
    await safeQuery(`ALTER TABLE departments ALTER COLUMN id SET DEFAULT gen_random_uuid()`, 'departments.id default');
    // Add missing columns to departments table
    await safeQuery(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()`, 'departments.created_at');
    await safeQuery(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS description TEXT`, 'departments.description');
    await safeQuery(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS folder_path TEXT`, 'departments.folder_path');
    await safeQuery(`ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(10)`, 'departments.code');

    // Add missing columns to documents table
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_data BYTEA`, 'documents.file_data');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS department VARCHAR(100)`, 'documents.department');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS approved_by VARCHAR(150)`, 'documents.approved_by');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS rejection_reason TEXT`, 'documents.rejection_reason');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS tags TEXT[] DEFAULT '{}'`, 'documents.tags');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_path TEXT`, 'documents.file_path');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS scanned_from VARCHAR(100)`, 'documents.scanned_from');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_encrypted BOOLEAN NOT NULL DEFAULT FALSE`, 'documents.is_encrypted');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ`, 'documents.trashed_at');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ`, 'documents.archived_at');
    // Ensure id column has a default UUID generator
    await safeQuery(`ALTER TABLE documents ALTER COLUMN id SET DEFAULT gen_random_uuid()`, 'documents.id default');
    // Make department_id nullable (we may not always have a matching dept UUID)
    await safeQuery(`ALTER TABLE documents ALTER COLUMN department_id DROP NOT NULL`, 'documents.department_id nullable');
    // Make department nullable too (added by migration, may not have NOT NULL)
    await safeQuery(`ALTER TABLE documents ALTER COLUMN department DROP NOT NULL`, 'documents.department nullable');
    // Create document_counters table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS document_counters (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
        year          INTEGER NOT NULL,
        last_number   INTEGER NOT NULL DEFAULT 0,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        UNIQUE(department_id, year)
      )
    `);
    // Ensure folders table has is_department column
    await safeQuery(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_department BOOLEAN NOT NULL DEFAULT FALSE`, 'folders.is_department');
    // Create activity_logs_archive table if missing
    await client.query(`
      CREATE TABLE IF NOT EXISTS activity_logs_archive (
        id          UUID PRIMARY KEY,
        user_id     UUID NOT NULL,
        user_name   VARCHAR(150) NOT NULL,
        user_role   VARCHAR(20) NOT NULL,
        action      VARCHAR(100) NOT NULL,
        target      VARCHAR(255) NOT NULL,
        target_type VARCHAR(20) NOT NULL,
        ip_address  VARCHAR(45),
        details     TEXT,
        created_at  TIMESTAMPTZ NOT NULL,
        archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    // Create scan_sessions table for NAPS2 integration
    await client.query(`
      CREATE TABLE IF NOT EXISTS scan_sessions (
        id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        title         VARCHAR(255) NOT NULL,
        format        VARCHAR(20) NOT NULL DEFAULT 'pdf',
        folder_id     UUID REFERENCES folders(id) ON DELETE SET NULL,
        user_id       UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        user_name     VARCHAR(150) NOT NULL,
        department    VARCHAR(100),
        status        VARCHAR(20) NOT NULL DEFAULT 'pending',
        document_id   UUID REFERENCES documents(id) ON DELETE SET NULL,
        error_message TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        completed_at  TIMESTAMPTZ
      )
    `);

    // Migration: Add soft delete columns to folders table
    await safeQuery(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ`, 'folders.trashed_at');
    await safeQuery(`ALTER TABLE folders ADD COLUMN IF NOT EXISTS status VARCHAR(20) DEFAULT 'active'`, 'folders.status');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_folders_trashed_at ON folders(trashed_at) WHERE trashed_at IS NOT NULL`, 'folders.trashed_at index');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_folders_status ON folders(status)`, 'folders.status index');

    // Migration: Add soft delete columns to users table
    await safeQuery(`ALTER TABLE users ADD COLUMN IF NOT EXISTS trashed_at TIMESTAMPTZ`, 'users.trashed_at');
    await safeQuery(`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check`, 'users_status_check drop');
    await safeQuery(`ALTER TABLE users ADD CONSTRAINT users_status_check CHECK (status IN ('active', 'inactive', 'trashed'))`, 'users_status_check add');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_users_trashed_at ON users(trashed_at) WHERE trashed_at IS NOT NULL`, 'users.trashed_at index');

    // Migration: Add trashed_by column to documents table
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS trashed_by UUID REFERENCES users(id) ON DELETE SET NULL`, 'documents.trashed_by');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_documents_trashed_retention ON documents(trashed_at) WHERE status = 'trashed'`, 'documents.trashed retention index');
    await safeQuery(`ALTER TABLE documents ADD COLUMN IF NOT EXISTS retention_days INT`, 'documents.retention_days');

    // Migration: Create trash_history audit table
    await client.query(`
      CREATE TABLE IF NOT EXISTS trash_history (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        target_type VARCHAR(20) NOT NULL CHECK (target_type IN ('document', 'folder', 'user')),
        target_id UUID NOT NULL,
        target_name VARCHAR(255) NOT NULL,
        action VARCHAR(20) NOT NULL CHECK (action IN ('trashed', 'restored', 'permanently_deleted')),
        performed_by UUID REFERENCES users(id) ON DELETE SET NULL,
        performed_by_name VARCHAR(150),
        retention_days INTEGER DEFAULT 30,
        scheduled_deletion_at TIMESTAMPTZ,
        actual_deletion_at TIMESTAMPTZ,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_trash_history_target ON trash_history(target_type, target_id)`, 'trash_history target index');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_trash_history_created ON trash_history(created_at)`, 'trash_history created index');

    // Migration: Create app_settings table for logo and other settings
    await client.query(`
      CREATE TABLE IF NOT EXISTS app_settings (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        setting_key VARCHAR(100) NOT NULL UNIQUE,
        setting_value TEXT,
        setting_type VARCHAR(50) DEFAULT 'text',
        updated_by UUID REFERENCES users(id) ON DELETE SET NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // Migration: Create delete_requests table
    await client.query(`
      CREATE TABLE IF NOT EXISTS delete_requests (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        type VARCHAR(20) NOT NULL CHECK (type IN ('folder','document')),
        target_id UUID NOT NULL,
        requested_by UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        department VARCHAR(100),
        status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','denied')),
        reason TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        approved_by UUID REFERENCES users(id) ON DELETE SET NULL,
        approved_at TIMESTAMPTZ,
        denied_by UUID REFERENCES users(id) ON DELETE SET NULL,
        denied_at TIMESTAMPTZ
      )
    `);
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_delete_requests_status ON delete_requests(status)`, 'delete_requests status index');
    await safeQuery(`CREATE INDEX IF NOT EXISTS idx_delete_requests_target ON delete_requests(target_id)`, 'delete_requests target index');

    // Insert default logo setting if not exists
    await client.query(`
      INSERT INTO app_settings (setting_key, setting_value, setting_type)
      VALUES ('app_logo', '/maptechlogo.png', 'image')
      ON CONFLICT (setting_key) DO NOTHING
    `);

    console.log('Migrations applied successfully');
  } catch (e: any) {
    console.warn('Migration warning:', e?.message || e);
  } finally {
    client.release();
  }
}

async function ensureDefaultAdmin() {
  const client = await (await import('./db')).default.connect();
  try {
    const email = process.env.ADMIN_EMAIL || 'admin@system.com';
    const name = process.env.ADMIN_NAME || 'System Administrator';
    const password = process.env.ADMIN_PASSWORD || 'admin123';
    const department = process.env.ADMIN_DEPARTMENT || 'Administration';
    const hash = await bcrypt.hash(password, 10);

    await client.query(
      `INSERT INTO users (name, email, password, role, department, status)
       VALUES ($1, $2, $3, 'admin', $4, 'active')
       ON CONFLICT (email)
       DO UPDATE SET
         name = EXCLUDED.name,
         password = EXCLUDED.password,
         role = 'admin',
         department = EXCLUDED.department,
         status = 'active'`,
      [name, email, hash, department]
    );

    console.log(`Default admin ensured for ${email}`);
  } catch (e: any) {
    console.warn('Default admin bootstrap warning:', e?.message || e);
  } finally {
    client.release();
  }
}

import authRoutes from './routes/auth.routes';
import documentRoutes from './routes/document.routes';
import folderRoutes from './routes/folder.routes';
import departmentRoutes from './routes/department.routes';
import userRoutes from './routes/user.routes';
import notificationRoutes from './routes/notification.routes';
import deleteRequestRoutes from './routes/delete-request.routes';
import activityLogRoutes from './routes/activity-log.routes';
import scannerRoutes from './routes/scanner.routes';
import cleanupRoutes from './routes/cleanup.routes';
import settingsRoutes from './routes/settings.routes';
import scanWatcher from './services/scanWatcher.service';
import cleanupService from './services/cleanup.service';

// Compatibility aliases for deployments that call root paths instead of /api/*.
app.use('/auth', authRoutes);
app.use('/folders', folderRoutes);
app.use('/settings', settingsRoutes);

app.use('/api/auth', authRoutes);
app.use('/api/documents', documentRoutes);
app.use('/api/folders', folderRoutes);
app.use('/api/departments', departmentRoutes);
app.use('/api/users', userRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/delete-requests', deleteRequestRoutes);
app.use('/api/activity-logs', activityLogRoutes);
app.use('/api/scanner', scannerRoutes);
app.use('/api/cleanup', cleanupRoutes);
app.use('/api/settings', settingsRoutes);

app.get('/api/scan-health', async (_req, res) => {
  const agentUrl = process.env.AGENT_URL || 'http://localhost:3001';

  try {
    const fetch = require('node-fetch') as any;
    const response = await fetch(`${agentUrl}/health`);

    if (!response.ok) {
      return res.json({
        agent: {
          status: 'offline',
          ok: false,
          naps2Installed: false,
          backendUrl: agentUrl,
        },
        error: 'Scanner agent returned a non-success response',
      });
    }

    const agent = await response.json();

    return res.json({ agent });
  } catch (error: any) {
    return res.json({
      agent: {
        status: 'offline',
        ok: false,
        naps2Installed: false,
        backendUrl: agentUrl,
      },
      error: 'Cannot reach scanner agent',
      details: error?.message || 'Unknown error',
    });
  }
});

const PORT = process.env.PORT || 5000;

connectDB().then(async (connected) => {
  if (!connected) {
    console.error('Server startup aborted: database connection failed.');
    process.exit(1);
  }

  await runMigrations();
  await ensureDefaultAdmin();
  // Start the cleanup service
  cleanupService.start();
  // Start the scan file watcher
  scanWatcher.startScanWatcher();
  app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
});

export default app;
