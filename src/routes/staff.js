const express = require('express');
const c = require('../controllers/staff');
const { auth } = require('../middleware/auth');
const wrap = require('../middleware/async');
const router = express.Router();
router.get('/shops/:shopId/staff', auth, wrap(c.list));
router.post('/shops/:shopId/staff', auth, wrap(c.add));
router.delete('/shops/:shopId/staff/:userId', auth, wrap(c.remove));
module.exports = router;
