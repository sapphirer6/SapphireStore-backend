require('dotenv').config();

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');

const { createLoginDbPool } = require('./loginDb');
const { createKeysApiClient } = require('./keysApiClient');
const { createAuthRouter } = require('./routes/auth');
const { createAdminRouter } = require('./routes/admin');
const { createPaymentsRouter } = require('./routes/payments');
const { createLoaderRouter } = require('./routes/loader');

const app = express();
const port = process.env.PORT || 4000;

app.use(cors({ origin: true, credentials: true }));
app.use(
  bodyParser.json({
    verify: (req, _res, buf) => {
      req.rawBody = buf.toString('utf8');
    }
  })
);

const loginDbPool = createLoginDbPool();

const keysApi = createKeysApiClient({
  baseUrl: process.env.DATABASE_KEYS_API_URL || 'http://localhost:5001',
  apiKey: process.env.DATABASE_KEYS_API_KEY || 'CHANGE_ME'
});

app.use('/api/auth', createAuthRouter({ loginDbPool }));
app.use('/api/admin', createAdminRouter({ keysApi }));
app.use('/api', createPaymentsRouter({ keysApi }));
app.use('/api', createLoaderRouter({ keysApi }));

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
