const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config();

const connectionString = process.env.DATABASE_URL || process.env.DB_URL || '';

const pool = connectionString
  ? new Pool({
      connectionString,
      ssl: process.env.NODE_ENV === 'production' || process.env.RAILWAY_ENVIRONMENT
        ? { rejectUnauthorized: false }
        : undefined,
    })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'maptech_dms',
    });

async function main() {
  const email = process.env.ADMIN_EMAIL || 'admin@system.com';
  const name = process.env.ADMIN_NAME || 'System Administrator';
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const department = process.env.ADMIN_DEPARTMENT || 'Administration';
  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    `INSERT INTO users (name, email, password, role, department, status)
     VALUES ($1, $2, $3, 'admin', $4, 'active')
     ON CONFLICT (email)
     DO UPDATE SET
       name = EXCLUDED.name,
       password = EXCLUDED.password,
       role = 'admin',
       department = EXCLUDED.department,
       status = 'active'
     RETURNING id`,
    [name, email, hash, department]
  );
  console.log('Admin ensured with id', res.rows[0].id, 'for', email);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
