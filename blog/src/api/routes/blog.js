const express = require("express");
const router = express.Router();
const { rewriteArticle, getPosts, searchPosts } = require("../controllers/blogController");

router.post("/rewrite", rewriteArticle);
router.get("/posts", getPosts);
router.get('/search', searchPosts);

module.exports = router;
