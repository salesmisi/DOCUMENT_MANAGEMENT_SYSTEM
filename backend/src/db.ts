import { Pool } from 'pg';
import dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DATABASE_URL || '';

if (!connectionString) {
  console.error('DATABASE_URL is required for PostgreSQL connection.');
}

const pool = new Pool({
  connectionString,
  ssl: connectionString ? { rejectUnauthorized: false } : false,
});

export const connectDB = async () => {
  if (!connectionString) {
    console.error('PostgreSQL connection skipped: DATABASE_URL is not configured.');
    return false;
  }

  try {
    const client = await pool.connect();
    console.log('PostgreSQL connected');
    client.release();
    return true;
  } catch (err) {
    console.error('PostgreSQL connection error:', err);
    return false;
  }
};

export default pool;
