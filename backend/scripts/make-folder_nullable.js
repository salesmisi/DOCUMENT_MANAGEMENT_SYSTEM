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
    console.log('Altering documents.folder_id to allow NULL...');
    await client.query('ALTER TABLE documents ALTER COLUMN folder_id DROP NOT NULL');
    console.log('Done.');
  } catch (err) {
    console.error('Error altering column:', err.message || err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => { console.error(err); process.exit(1); });
