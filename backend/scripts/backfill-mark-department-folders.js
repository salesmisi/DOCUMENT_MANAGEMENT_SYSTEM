const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

async function run() {
  try {
    console.log('Marking department root folders as is_department=true...');
    const res = await pool.query(
      `UPDATE folders f
       SET is_department = TRUE
       FROM departments d
       WHERE f.parent_id IS NULL
         AND LOWER(f.name) = LOWER(d.name)
       RETURNING f.id, f.name`
    );

    console.log(`Updated ${res.rowCount} folder(s):`);
    res.rows.forEach((r) => console.log('-', r.id, r.name));
  } catch (e) {
    console.error('Backfill failed:', e.message || e);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

run();
