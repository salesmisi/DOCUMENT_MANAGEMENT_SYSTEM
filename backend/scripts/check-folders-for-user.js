const { Pool } = require('pg');
require('dotenv').config();

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
});

const email = process.argv[2] || 'ren@maptech.com';

(async () => {
  try {
    const u = await pool.query('SELECT id, name, role, department FROM users WHERE LOWER(email) = LOWER($1) LIMIT 1', [email]);
    if (u.rows.length === 0) {
      console.error('User not found for email', email);
      process.exit(1);
    }
    const user = u.rows[0];
    console.log('Simulating visibility for user:', user);

    const f = await pool.query('SELECT id, name, parent_id, department, visibility, created_by_id, is_department FROM folders ORDER BY created_at');
    console.log(`Total folders: ${f.rowCount}`);
    const visible = f.rows.filter((folder) => {
      const vis = folder.visibility || 'private';
      if (user.role === 'admin') return true;
      if (vis === 'admin-only') return false;
      if (vis === 'department') return String(folder.department || '').trim().toLowerCase() === String(user.department || '').trim().toLowerCase();
      if (vis === 'private') return String(folder.created_by_id || '') === String(user.id || '');
      return false;
    });
    console.log('Visible folders for user:');
    visible.forEach((v) => console.log('-', v.id, v.name, v.department, v.visibility, 'is_department=', v.is_department));
  } catch (e) {
    console.error(e);
  } finally {
    await pool.end();
  }
})();
