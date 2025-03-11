const pool = require('../../../config/db');
const { fetchArticleContent } = require('../../services/crawl');
const aiService = require('../../services/googleStudioService');

async function rewriteArticle(req, res) {
    try {
        const { url, style, category } = req.body;
        if (!url || !style || !category) {
            return res.status(400).json({ error: "Thiếu URL, phong cách hoặc danh mục" });
        }

        const client = await pool.connect();
        try {
            await client.query("BEGIN");

            // Kiểm tra danh mục trong bảng categories
            let categoryId;
            const categoryResult = await client.query("SELECT id FROM categories WHERE name = $1", [category]);
            if (categoryResult.rows.length > 0) {
                categoryId = categoryResult.rows[0].id; // Nếu tồn tại, lấy ID
            } else {
                const insertCategory = await client.query(
                    "INSERT INTO categories (name) VALUES ($1) RETURNING id",
                    [category]
                );
                categoryId = insertCategory.rows[0].id; // Nếu chưa có, chèn mới và lấy ID
            }

            // Crawl nội dung bài viết từ URL
            const { title, content } = await fetchArticleContent(url);
            if (!title || !content) {
                throw new Error("Không thể lấy nội dung bài viết");
            }

            // Gửi prompt đến AI 
            const aiPrompt = `Bạn là content creater chuyên nghiệp với 50 năm kinh nghiệm nhiệm vụ của bạn là hãy viết lại bài có tiêu đề: "${title}" theo phong cách ${style}.
                              Yêu cầu:                                 
                                    1. Giữ nguyên ý chính và thông tin quan trọng                                 
                                    2. Thay đổi cách diễn đạt để phù hợp với phong cách ${style}                                 
                                    3. Đảm bảo bài viết mạch lạc, rõ ràng và hấp dẫn                                 
                                    4. Giữ nguyên độ dài tương đối so với bài gốc                                 
                              Nội dung bài viết gốc:${content}`;
            const rewrittenContent = await aiService.generateContent(aiPrompt);
            if (!rewrittenContent) {
                throw new Error("Lỗi từ AI Service");
            }

            // Lưu bài viết vào bảng post
            const insertPostQuery = `
                INSERT INTO posts (title, content, category_id) 
                VALUES ($1, $2, $3) 
                RETURNING id
            `;
            const postResult = await client.query(insertPostQuery, [title, rewrittenContent, categoryId]);

            await client.query("COMMIT"); // Commit nếu không có lỗi

            res.json({
                success: true,
                message: "Bài viết đã tạo thành công",
                article: { id: postResult.rows[0].id, title, content: rewrittenContent, category },
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
        const { page = 1, limit = 10 } = req.query; // Mặc định: trang 1, mỗi trang 10 bài

        // Chuyển đổi về kiểu số nguyên
        const pageNum = parseInt(page, 10);
        const limitNum = parseInt(limit, 10);
        const offset = (pageNum - 1) * limitNum; // Tính vị trí bắt đầu

        const client = await pool.connect();
        try {
            // Lấy tổng số bài viết
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
                totalCount, // Tổng số bài viết
                totalPages: Math.ceil(totalCount / limitNum), // Tổng số trang
                currentPage: pageNum,
                posts: postsResult.rows, // Danh sách bài viết
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


module.exports = { rewriteArticle, getPosts, searchPosts };
