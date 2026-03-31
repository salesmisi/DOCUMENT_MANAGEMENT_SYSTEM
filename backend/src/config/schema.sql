-- ============================================
-- 7. DELETE REQUESTS
-- ============================================
CREATE TABLE delete_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
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
);
-- ============================================
-- Maptech DMS – PostgreSQL Schema
-- ============================================

-- Extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- 1. DEPARTMENTS
-- ============================================
CREATE TABLE departments (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(100) NOT NULL UNIQUE,
  created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- ============================================
-- 2. USERS
-- ============================================
CREATE TABLE users (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        VARCHAR(150)  NOT NULL,
  email       VARCHAR(255)  NOT NULL UNIQUE,
  password    VARCHAR(255)  NOT NULL,
  role        VARCHAR(20)   NOT NULL DEFAULT 'staff'
              CHECK (role IN ('admin','manager','staff')),
  department  VARCHAR(100)  NOT NULL,
  status      VARCHAR(20)   NOT NULL DEFAULT 'active'
              CHECK (status IN ('active','inactive')),
  avatar      TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================
-- 3. FOLDERS
-- ============================================
CREATE TABLE folders (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(255)  NOT NULL,
  parent_id       UUID          REFERENCES folders(id) ON DELETE CASCADE,
  department      VARCHAR(100)  NOT NULL,
  is_department   BOOLEAN       NOT NULL DEFAULT FALSE,
  created_by      VARCHAR(150)  NOT NULL,
  created_by_id   UUID          NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  created_by_role VARCHAR(20)   NOT NULL
                  CHECK (created_by_role IN ('admin','manager','staff')),
  visibility      VARCHAR(20)   NOT NULL DEFAULT 'department'
                  CHECK (visibility IN ('private','department','admin-only')),
  permissions     TEXT[]        DEFAULT '{}',
  created_at      TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================
-- 4. DOCUMENTS
-- ============================================
CREATE TABLE documents (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            VARCHAR(255)  NOT NULL,
  department       VARCHAR(100)  NOT NULL,
  reference        VARCHAR(100),
  date             DATE          NOT NULL DEFAULT CURRENT_DATE,
  uploaded_by      VARCHAR(150)  NOT NULL,
  uploaded_by_id   UUID          NOT NULL REFERENCES users(id) ON DELETE SET NULL,
  status           VARCHAR(20)   NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','approved','rejected','archived','trashed')),
  version          INT           NOT NULL DEFAULT 1,
  file_type        VARCHAR(10)   NOT NULL,
  size             VARCHAR(50),
  folder_id        UUID          NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
  needs_approval   BOOLEAN       NOT NULL DEFAULT TRUE,
  approved_by      VARCHAR(150),
  rejection_reason TEXT,
  metadata         JSONB         DEFAULT '{}',
  is_encrypted     BOOLEAN       NOT NULL DEFAULT FALSE,
  retention_days   INT,
  trashed_at       TIMESTAMPTZ,
  archived_at      TIMESTAMPTZ,
  tags             TEXT[]        DEFAULT '{}',
  description      TEXT,
  scanned_from     VARCHAR(100),
  file_data        BYTEA,
  file_path        TEXT,
  created_at       TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================
-- 5. ACTIVITY LOGS
-- ============================================
CREATE TABLE activity_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  user_name   VARCHAR(150)  NOT NULL,
  user_role   VARCHAR(20)   NOT NULL,
  action      VARCHAR(100)  NOT NULL,
  target      VARCHAR(255)  NOT NULL,
  target_type VARCHAR(20)   NOT NULL
              CHECK (target_type IN ('document','folder','user','system')),
  ip_address  VARCHAR(45),
  details     TEXT,
  created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================
-- 6. NOTIFICATIONS
-- ============================================
CREATE TABLE notifications (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type         VARCHAR(50)   NOT NULL DEFAULT 'approval',
  title        VARCHAR(255)  NOT NULL,
  message      TEXT          NOT NULL,
  document_id  UUID          REFERENCES documents(id) ON DELETE CASCADE,
  is_read      BOOLEAN       NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

-- ============================================
-- INDEXES
-- ============================================
CREATE INDEX idx_users_email       ON users(email);
CREATE INDEX idx_users_department   ON users(department);
CREATE INDEX idx_documents_folder   ON documents(folder_id);
CREATE INDEX idx_documents_status   ON documents(status);
CREATE INDEX idx_documents_dept     ON documents(department);
CREATE INDEX idx_folders_parent     ON folders(parent_id);
CREATE INDEX idx_folders_dept       ON folders(department);
CREATE INDEX idx_activity_user      ON activity_logs(user_id);
CREATE INDEX idx_activity_created   ON activity_logs(created_at);
CREATE INDEX idx_notifications_user ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);

-- ============================================
-- SEED: Default admin user (password: admin123)
-- After running this schema, run:  node seed-admin.js
-- to set the properly bcrypt-hashed password.
-- ============================================
INSERT INTO users (name, email, password, role, department, status)
VALUES (
  'System Administrator',
  'admin@system.com',
  'PLACEHOLDER_RUN_SEED_ADMIN_JS',
  'admin',
  'Administration',
  'active'
);

-- ============================================
-- 7. DEPARTMENTS: add code column
-- ============================================
ALTER TABLE departments
ADD COLUMN IF NOT EXISTS code VARCHAR(10);

-- Ensure documents.reference is unique
ALTER TABLE documents
ADD CONSTRAINT IF NOT EXISTS uq_documents_reference UNIQUE (reference);

-- ============================================
-- 8. NOTIFICATION PREFERENCES
-- ============================================
CREATE TABLE IF NOT EXISTS notification_preferences (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id         UUID NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  email_enabled   BOOLEAN NOT NULL DEFAULT TRUE,
  browser_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  approvals_enabled BOOLEAN NOT NULL DEFAULT TRUE,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notif_prefs_user ON notification_preferences(user_id);

-- ============================================
-- 9. Document counters (per-department per-year)
-- ============================================
CREATE TABLE IF NOT EXISTS document_counters (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
  year          INTEGER NOT NULL,
  last_number   INTEGER NOT NULL DEFAULT 0,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(department_id, year)
);
