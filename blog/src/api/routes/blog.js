const express = require('express');
const router = express.Router();
const blogController = require('../controllers/blogController');

router.post('/rewrite', blogController.rewriteArticle);

module.exports = router;
