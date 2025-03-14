const express = require("express");
const rateLimit = require("express-rate-limit");
const router = express.Router();
const { upload, rewriteArticle, getPosts, searchPosts } = require("../controllers/blogController");

const rewriteArticleLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 phút
    max: 5, // Tối đa 5 request mỗi phút
    message: { error: "Bạn đã gửi quá nhiều yêu cầu, vui lòng thử lại sau!" },
    headers: true,
});

// Áp dụng Rate Limiting vào API
router.post("/rewrite", rewriteArticleLimiter, upload.single("file"), rewriteArticle);
router.get("/posts", getPosts);
router.get("/search", searchPosts);

module.exports = router;
