require('dotenv').config();
const fetch = global.fetch || require('node-fetch');

const base = `http://localhost:${process.env.PORT || 5000}`;

(async () => {
  try {
    console.log('Logging in as admin...');
    const loginRes = await fetch(`${base}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@system.com', password: 'admin123' })
    });
    const loginBody = await loginRes.json();
    if (!loginRes.ok) {
      console.error('Login failed:', loginBody);
      return;
    }
    const token = loginBody.token;
    console.log('Token acquired');

    const name = 'TEMP_CREATE_DEPT_' + Date.now();
    console.log('Creating department:', name);
    const createRes = await fetch(`${base}/api/departments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name })
    });
    const createBody = await createRes.json();
    if (!createRes.ok) {
      console.error('Create failed:', createBody);
      return;
    }
    const deptId = createBody.department.id;
    console.log('Created dept id=', deptId);

    console.log('Waiting a moment for server-side log insertion...');
    await new Promise((r) => setTimeout(r, 500));

    console.log('Fetching recent activity logs...');
    const logsRes = await fetch(`${base}/api/activity-logs`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const logsBody = await logsRes.json();
    if (!logsRes.ok) {
      console.error('Failed to fetch logs:', logsBody);
      return;
    }
    const found = logsBody.logs.filter(l => l.action === 'CREATE_DEPARTMENT' || l.target === name);
    console.log('Matching logs:', found);

    // Cleanup: delete created department
    console.log('Deleting department id=', deptId);
    const delRes = await fetch(`${base}/api/departments/${deptId}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    console.log('Delete status:', delRes.status);
  } catch (e) {
    console.error('Error during test:', e.message || e);
  }
})();
