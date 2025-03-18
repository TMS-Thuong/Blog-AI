const { parentPort, workerData } = require('worker_threads');
const { fetchArticleContent } = require('../services/crawl');
const { generateContent } = require('../services/googleStudioService');
const pool = require('../../config/db');

async function processArticle({ url, category, style }) {
    const client = await pool.connect();
    try {
        console.log(`Đang xử lý: ${url}`);

        let { title, content } = await fetchArticleContent(url);
        if (!content || content.length < 100) {
            throw new Error(`Bỏ qua bài viết ${url} vì nội dung quá ngắn.`);
        }

        const rewrittenContent = await generateContent({ title, content, style });
        if (!rewrittenContent) {
            throw new Error(`AI không thể viết lại bài ${title}`);
        }

        // Kiểm tra danh mục
        let categoryId;
        const categoryRes = await client.query("SELECT id FROM categories WHERE name = $1", [category]);
        if (categoryRes.rows.length > 0) {
            categoryId = categoryRes.rows[0].id;
        } else {
            const insertCategory = await client.query(
                "INSERT INTO categories (name) VALUES ($1) RETURNING id",
                [category]
            );
            categoryId = insertCategory.rows[0].id;
        }

        // Lưu vào database
        await client.query(
            "INSERT INTO posts (title, content, category_id, created_at) VALUES ($1, $2, $3, NOW())",
            [title, rewrittenContent, categoryId]
        );

        console.log(`Lưu thành công: ${title}`);
        parentPort.postMessage({ url, status: "success" });
    } catch (error) {
        console.error(`Lỗi với ${url}:`, error.message);
        parentPort.postMessage({ url, status: "error", message: error.message });
    } finally {
        client.release();
    }
}

processArticle(workerData);
