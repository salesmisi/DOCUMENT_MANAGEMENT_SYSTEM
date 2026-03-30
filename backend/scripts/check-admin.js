const { Pool } = require('pg');
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
  const res = await pool.query('SELECT id, email, password, name FROM users LIMIT 10');
  console.log('users:', res.rows);
  await pool.end();
}

main().catch(err => { console.error(err); process.exit(1); });
