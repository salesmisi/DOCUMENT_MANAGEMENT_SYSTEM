const bcrypt = require('bcrypt');
const { Pool } = require('pg');
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
  const password = process.env.ADMIN_PASSWORD || 'admin123';
  const hash = await bcrypt.hash(password, 10);
  await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, email]);
  console.log('Admin password updated for', email);
  await pool.end();
}

main().catch(console.error);
