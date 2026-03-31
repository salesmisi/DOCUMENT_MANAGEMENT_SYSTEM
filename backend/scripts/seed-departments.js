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

const departments = [
  { name: 'Accounting', code: 'ACC' },
  { name: 'Marketing', code: 'MKT' },
  { name: 'Technical Support', code: 'TECH' },
  { name: 'Administration', code: 'ADMIN' },
  { name: 'HR', code: 'HR' },
];

async function main() {
  const client = await pool.connect();
  try {
    for (const d of departments) {
      const res = await client.query('SELECT id FROM departments WHERE name = $1', [d.name]);
      if (res.rows.length === 0) {
        await client.query('INSERT INTO departments (name, code) VALUES ($1, $2)', [d.name, d.code]);
        console.log('Inserted department', d.name);
      } else {
        await client.query('UPDATE departments SET code = $1 WHERE name = $2', [d.code, d.name]);
        console.log('Updated department code for', d.name);
      }
    }
    console.log('Departments seeding complete');
  } catch (err) {
    console.error('seed-departments error', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
