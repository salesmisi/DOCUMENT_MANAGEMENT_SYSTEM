const path = require('path');
const dotenv = require('dotenv');
const { Pool } = require('pg');

dotenv.config({ path: path.join(process.cwd(), '.env') });

const connectionString = process.env.DATABASE_URL || process.env.DB_URL || '';

const pool = connectionString
  ? new Pool({ connectionString })
  : new Pool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT) || 5432,
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || '',
      database: process.env.DB_NAME || 'maptech_dms'
    });

async function main() {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    await client.query(
      'UPDATE documents SET reference = $1 WHERE id = $2',
      ['ADM_2026_018', '9bb24ff6-e440-4d0d-b8c8-5c59ecd979e6']
    );

    await client.query(
      'UPDATE documents SET reference = $1 WHERE id = $2',
      ['ADM_2026_023', 'dad381e8-a288-419c-8e95-d6da7ef1ae4e']
    );

    await client.query('COMMIT');
    console.log('Updated conflicting admin references successfully.');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error.stack || error.message || error);
  process.exit(1);
});