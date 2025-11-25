const express = require('express');
const { requireAdmin } = require('../adminAuth');

function createAdminRouter() {
  const router = express.Router();

  router.get('/me', requireAdmin, (req, res) => {
    res.json({ admin: req.admin });
  });

  return router;
}

module.exports = { createAdminRouter };

