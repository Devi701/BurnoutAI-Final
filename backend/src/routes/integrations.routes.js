const express = require('express');
const router = express.Router();
const { connectGoogle, googleCallback } = require('../controllers/integrations.controller');

router.get('/connect/google', connectGoogle);
router.get('/callback/google', googleCallback);

module.exports = router;