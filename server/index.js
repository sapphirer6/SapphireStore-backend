require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const { createLoginDbPool } = require('./loginDb');
const { createKeysApiClient } = require('./keysApiClient');
const { createAuthRouter } = require('./routes/auth');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(bodyParser.json());

const loginDbPool = createLoginDbPool();

const keysApi = createKeysApiClient({
  baseUrl: process.env.DATABASE_KEYS_API_URL || 'http://localhost:5001',
  apiKey: process.env.DATABASE_KEYS_API_KEY || 'CHANGE_ME'
});

app.use('/api/auth', createAuthRouter({ loginDbPool }));

app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    loginDb: !!loginDbPool,
    keysApiConfigured: !!process.env.DATABASE_KEYS_API_URL
  });
});

app.listen(port, () => {
  console.log(`[SapphireStore] Backend listening on port ${port}`);
});
