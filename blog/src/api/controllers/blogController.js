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
            const aiPrompt = `Viết lại bài viết với tiêu đề: "${title}" theo phong cách ${style}. Nội dung bài viết:\n\n${content}`;
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

module.exports = { rewriteArticle };
