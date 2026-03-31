const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function run() {
  // Check existing tables
  const res = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
  const existing = res.rows.map(r => r.tablename);
  console.log('Existing tables:', existing);

  // Create users table if missing
  if (!existing.includes('users')) {
    await pool.query(`
      CREATE TABLE users (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
      CREATE INDEX idx_users_email ON users(email);
      CREATE INDEX idx_users_department ON users(department);
    `);
    console.log('Created: users');
  }

  // Create folders table if missing
  if (!existing.includes('folders')) {
    await pool.query(`
      CREATE TABLE folders (
        id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
      CREATE INDEX idx_folders_parent ON folders(parent_id);
      CREATE INDEX idx_folders_dept ON folders(department);
    `);
    console.log('Created: folders');
  }

  // Create activity_logs table if missing
  if (!existing.includes('activity_logs')) {
    await pool.query(`
      CREATE TABLE activity_logs (
        id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
      CREATE INDEX idx_activity_user ON activity_logs(user_id);
      CREATE INDEX idx_activity_created ON activity_logs(created_at);
    `);
    console.log('Created: activity_logs');
  }

  // Create notifications table if missing
  if (!existing.includes('notifications')) {
    await pool.query(`
      CREATE TABLE notifications (
        id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        user_id      UUID          NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        type         VARCHAR(50)   NOT NULL DEFAULT 'approval',
        title        VARCHAR(255)  NOT NULL,
        message      TEXT          NOT NULL,
        document_id  UUID          REFERENCES documents(id) ON DELETE CASCADE,
        is_read      BOOLEAN       NOT NULL DEFAULT FALSE,
        created_at   TIMESTAMPTZ   NOT NULL DEFAULT NOW()
      );
      CREATE INDEX idx_notifications_user ON notifications(user_id);
      CREATE INDEX idx_notifications_read ON notifications(user_id, is_read);
    `);
    console.log('Created: notifications');
  }

  // Add code column to departments if missing
  try {
    await pool.query("ALTER TABLE departments ADD COLUMN IF NOT EXISTS code VARCHAR(10)");
  } catch (e) { /* ignore if exists */ }

  // Ensure folders table has is_department column
  try {
    await pool.query("ALTER TABLE folders ADD COLUMN IF NOT EXISTS is_department BOOLEAN NOT NULL DEFAULT FALSE");
  } catch (e) { /* ignore if exists */ }

  await pool.end();
  console.log('Done!');
}

run().catch(e => { console.error(e); process.exit(1); });
