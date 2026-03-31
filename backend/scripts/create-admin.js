const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const dotenv = require('dotenv');

dotenv.config();

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 5432,
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'maptech_dms',
});

async function main() {
  const email = 'admin@system.com';
  const name = 'System Administrator';
  const password = 'admin123';

  const check = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
  if (check.rows.length > 0) {
    console.log('Admin already exists, updating password...');
    const hash = await bcrypt.hash(password, 10);
    await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, email]);
    console.log('Password updated for', email);
    await pool.end();
    return;
  }

  const hash = await bcrypt.hash(password, 10);
  const res = await pool.query(
    `INSERT INTO users (name, email, password, role, department, status)
     VALUES ($1,$2,$3,$4,$5,$6)
     RETURNING id`,
    [name, email, hash, 'admin', 'Administration', 'active']
  );
  console.log('Admin created with id', res.rows[0].id);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
