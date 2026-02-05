const express = require('express');
const router = express.Router();
const trelloController = require('../controllers/trelloController');

router.get('/auth', trelloController.auth);
router.get('/callback', trelloController.callback);

module.exports = router;
