const express = require("express");
const router = express.Router();
const { upload, rewriteArticle, getPosts, searchPosts } = require("../controllers/blogController");

router.post("/rewrite", upload.single("file"), rewriteArticle); 
router.get("/posts", getPosts);
router.get('/search', searchPosts);

module.exports = router;
