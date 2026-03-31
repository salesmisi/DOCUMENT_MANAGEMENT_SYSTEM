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

const nameArg = process.argv[2] || 'QA_Test_Department';
const cleanName = nameArg.trim();

async function main() {
  const client = await pool.connect();
  try {
    // Check department exists
    const depRes = await client.query('SELECT id FROM departments WHERE LOWER(name) = LOWER($1)', [cleanName]);
    if (depRes.rows.length > 0) {
      console.log('Department already exists:', cleanName);
      return;
    }

    // Check existing root folder
    const folderRes = await client.query('SELECT id, department FROM folders WHERE LOWER(name) = LOWER($1) AND parent_id IS NULL', [cleanName]);
    let folderId;
    if (folderRes.rows.length > 0) {
      folderId = folderRes.rows[0].id;
      console.log('Using existing folder id:', folderId);
      const existingFolderDept = folderRes.rows[0].department;
      if (!existingFolderDept || existingFolderDept !== cleanName) {
        await client.query('UPDATE folders SET department = $1 WHERE id = $2', [cleanName, folderId]);
        console.log('Updated folder department field');
      }
    } else {
      // create folder
      const { v4: uuidv4 } = require('uuid');
      folderId = uuidv4();
      await client.query(
        `INSERT INTO folders (id, name, parent_id, department, created_by, created_by_id, created_by_role, visibility, permissions, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [folderId, cleanName, null, cleanName, 'script', null, 'admin', 'department', '{}', new Date()]
      );
      console.log('Created folder with id:', folderId);
    }

    // Insert department
    const deptInsert = await client.query(
      'INSERT INTO departments (name, description, folder_path) VALUES ($1, $2, $3) RETURNING id',
      [cleanName, 'Created by test script', cleanName]
    );
    console.log('Created department id:', deptInsert.rows[0].id);

  } catch (err) {
    console.error('test-create-dept error:', err);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
