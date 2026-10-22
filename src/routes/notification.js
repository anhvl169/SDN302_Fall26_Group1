const express = require('express');
const c = require('../controllers/notification');
const { auth } = require('../middleware/auth');
const wrap = require('../middleware/async');
const router = express.Router();
router.get('/notifications', auth, wrap(c.list));
router.patch('/notifications/:id/read', auth, wrap(c.markRead));
module.exports = router;
