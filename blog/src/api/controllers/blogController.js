const pool = require('../../../config/db');
const { fetchArticleContent } = require('../../services/crawl');
const aiService = require('../../services/googleStudioService');
const fs = require('fs');
const csv = require('csv-parser');
const multer = require('multer');

const upload = multer({ dest: 'uploads/' });

async function processCSV(filePath) {
    const articles = [];

    return new Promise((resolve, reject) => {
        fs.createReadStream(filePath)
            .pipe(csv())
            .on('data', (row) => {
                articles.push(row);
            })
            .on('end', () => resolve(articles))
            .on('error', (error) => reject(error));
    });
}

async function rewriteArticle(req, res) {
    try {
        if (!req.file) {
            return res.status(400).json({ error: "Thiếu file CSV" });
        }

        const filePath = req.file.path;

        // Đọc dữ liệu từ file CSV
        const articles = await processCSV(filePath);
        if (articles.length === 0) {
            return res.status(400).json({ error: "Không có dữ liệu trong file CSV" });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN"); // Bắt đầu transaction

            let responseArticles = [];

            // Duyệt từng dòng trong file CSV
            for (const article of articles) {
                const { category, url, style } = article;
                console.log("Bài viết đang xử lý:", article);

                if (!category || !url || !style) {
                    return res.status(400).json({ error: "Thiếu category, url hoặc style trong file CSV" });
                }

                // Kiểm tra danh mục trong bảng categories
                let categoryId;
                const categoryResult = await client.query("SELECT id FROM categories WHERE name = $1", [category]);
                if (categoryResult.rows.length > 0) {
                    categoryId = categoryResult.rows[0].id;
                } else {
                    const insertCategory = await client.query(
                        "INSERT INTO categories (name) VALUES ($1) RETURNING id",
                        [category]
                    );
                    categoryId = insertCategory.rows[0].id;
                }

                // Crawl nội dung bài viết từ URL
                const { title, content } = await fetchArticleContent(url);
                if (!title || !content) {
                    throw new Error(`Không thể lấy nội dung bài viết từ URL: ${url}`);
                }
                const aiPrompt = `Bạn là content creater chuyên nghiệp với 50 năm kinh nghiệm nhiệm vụ của bạn là hãy viết lại bài có tiêu đề: "${title}" theo phong cách ${style}.
                                  Yêu cầu:                                 
                                        1. Giữ nguyên ý chính và thông tin quan trọng                                 
                                        2. Thay đổi cách diễn đạt để phù hợp với phong cách ${style}                                 
                                        3. Đảm bảo bài viết mạch lạc, rõ ràng và hấp dẫn                                 
                                        4. Giữ nguyên độ dài tương đối so với bài gốc                                 
                                  Nội dung bài viết gốc:${content}`;

                const rewrittenContent = await aiService.generateContent(aiPrompt);
                if (!rewrittenContent) {
                    throw new Error(`Lỗi từ AI Service khi xử lý bài viết: ${title}`);
                }

                // Lưu bài viết vào bảng posts
                const insertPostQuery = `
                    INSERT INTO posts (title, content, category_id) 
                    VALUES ($1, $2, $3) 
                    RETURNING id
                `;
                const postResult = await client.query(insertPostQuery, [title, rewrittenContent, categoryId]);

                responseArticles.push({
                    id: postResult.rows[0].id,
                    title,
                    content: rewrittenContent,
                    category
                });
            }

            await client.query("COMMIT"); // Commit nếu không có lỗi

            res.json({
                success: true,
                message: "Tất cả bài viết đã được xử lý thành công",
                articles: responseArticles
            });
        } catch (error) {
            await client.query("ROLLBACK"); // Rollback nếu có lỗi xảy ra
            console.error("Lỗi khi lưu bài viết:", error);
            res.status(500).json({ error: "Lỗi khi xử lý bài viết" });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Lỗi hệ thống:", error);
        res.status(500).json({ error: "Lỗi hệ thống" });
    }
}

async function getPosts(req, res) {
    try {
        const { page = 1, limit = 10 } = req.query;

        // Chuyển đổi về kiểu số nguyên
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum; 
        const client = await pool.connect();
        try {
            const countResult = await client.query("SELECT COUNT(*) FROM posts");
            const totalCount = parseInt(countResult.rows[0].count, 10);

            // Lấy danh sách bài viết theo phân trang
            const query = `
                SELECT p.id, p.title, p.content, c.name AS category, p.created_at
                FROM posts p
                JOIN categories c ON p.category_id = c.id
                ORDER BY p.created_at DESC
                LIMIT $1 OFFSET $2
            `;
            const postsResult = await client.query(query, [limitNum, offset]);

            res.json({
                success: true,
                totalCount, 
                totalPages: Math.ceil(totalCount / limitNum),
                currentPage: pageNum,
                posts: postsResult.rows,
            });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Lỗi khi lấy danh sách bài viết:", error);
        res.status(500).json({ error: "Lỗi khi lấy danh sách bài viết" });
    }
}


async function searchPosts(req, res) {
    try {
        const { keyword, category_id, page = 1, limit = 10 } = req.query;

        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum;

        const client = await pool.connect();
        try {
            let query = `
                SELECT p.id, p.title, p.content, c.name AS category, p.created_at
                FROM posts p
                JOIN categories c ON p.category_id = c.id
                WHERE 1=1
            `;
            let values = [];

            // Tìm kiếm không dấu
            if (keyword) {
                values.push(`%${keyword}%`);
                query += ` AND (unaccent(p.title) ILIKE unaccent($${values.length}) 
                               OR unaccent(p.content) ILIKE unaccent($${values.length}))`;
            }

            if (category_id) {
                values.push(category_id);
                query += ` AND p.category_id = $${values.length}`;
            }

            query += ` ORDER BY p.created_at DESC LIMIT $${values.length + 1} OFFSET $${values.length + 2}`;
            values.push(limitNum, offset);

            const postsResult = await client.query(query, values);
            res.json({ success: true, posts: postsResult.rows });
        } finally {
            client.release();
        }
    } catch (error) {
        console.error("Lỗi khi tìm kiếm bài viết:", error);
        res.status(500).json({ error: "Lỗi khi tìm kiếm bài viết" });
    }
}


module.exports = { upload, rewriteArticle, getPosts, searchPosts };
