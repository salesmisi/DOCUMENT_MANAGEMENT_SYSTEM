const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const dept = process.argv[2];
if (!dept) {
  console.error('Usage: node show-folders-for-dept.js <DepartmentName>');
  process.exit(1);
}

(async () => {
  try {
    const res = await pool.query('SELECT id, name, parent_id, department, visibility, is_department, created_by FROM folders WHERE LOWER(department) = LOWER($1) ORDER BY created_at', [dept]);
    console.log(`Found ${res.rowCount} folders for department '${dept}':`);
    res.rows.forEach(r => console.log(r));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
