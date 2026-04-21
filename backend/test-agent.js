// test-agent.js
const fetch = require('node-fetch'); // install if needed: npm install node-fetch@2
const AGENT_URL = process.env.AGENT_URL || 'http://localhost:3001';

fetch(`${AGENT_URL}/health`)
  .then(res => res.json())
  .then(data => {
    console.log('Agent response:', data);
  })
  .catch(err => {
    console.error('Error connecting to agent:', err.message);
  });