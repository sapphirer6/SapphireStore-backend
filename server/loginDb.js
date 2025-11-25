const { Pool } = require('pg');

function createLoginDbPool() {
  const connectionString = process.env.DATABASE_LOGIN_URL;

  if (!connectionString) {
    console.warn(
      '[SapphireStore] DATABASE_LOGIN_URL not set; login routes will fail until configured.'
    );
    return null;
  }

  return new Pool({
    connectionString
  });
}

module.exports = { createLoginDbPool };
