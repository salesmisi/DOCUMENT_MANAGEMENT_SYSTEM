const { Client } = require('pg');
require('dotenv').config();

(async () => {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'maptech_dms'
  });
  await client.connect();
  try {
    const res = await client.query(`SELECT id, user_id, user_name, action, target, details, created_at FROM activity_logs ORDER BY created_at DESC LIMIT 20`);
    console.log('Recent activity_logs:');
    res.rows.forEach((r) => console.log(JSON.stringify(r)));
  } catch (e) {
    console.error('Error listing activity_logs:', e.message || e);
  } finally {
    await client.end();
  }
})();
