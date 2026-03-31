const bcrypt = require('bcrypt');
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
  const hash = await bcrypt.hash('admin123', 10);
  await pool.query('UPDATE users SET password = $1 WHERE email = $2', [hash, 'admin@system.com']);
  console.log('Admin password updated. Hash:', hash);
  await pool.end();
}

main().catch(console.error);
