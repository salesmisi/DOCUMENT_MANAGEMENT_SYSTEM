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
  const client = await pool.connect();
  try {
    const depts = await client.query('SELECT id, name, code FROM departments ORDER BY name');
    console.log('departments:', depts.rows);
    const folds = await client.query('SELECT id, name, department FROM folders ORDER BY created_at DESC LIMIT 20');
    console.log('folders:', folds.rows);
  } catch (err) {
    console.error(err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
