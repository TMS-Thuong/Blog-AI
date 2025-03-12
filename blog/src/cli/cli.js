#!/usr/bin/env node

const { Command } = require("commander");
const { fetchArticleContent } = require("../services/crawl");
const { generateContent } = require("../services/googleStudioService");
const pool = require("../../config/db");

const program = new Command();

program
    .name("bloggen")
    .description("Công cụ dòng lệnh để quản lý hệ thống BLOG-AI")
    .version("1.0.0");

// Lệnh khởi tạo database
program
    .command("init")
    .description("Kiểm tra kết nối database")
    .action(async () => {
        try {
            const client = await pool.connect();
            await client.query("SELECT 1");
            client.release();
            console.log("Kết nối database thành công!");
        } catch (error) {
            console.error("Lỗi kết nối database:", error.message);
        }
    });

// Lệnh crawl dữ liệu
program
    .command("crawl <url>")
    .description("Crawl và tạo bài viết từ một URL")
    .option("--style <style>", "Phong cách viết bài")
    .option("--category <category>", "Danh mục bài viết")
    .action(async (url, options) => {
        const client = await pool.connect();
        try {
            console.log("Đang crawl dữ liệu từ:", url);
            const { title, content } = await fetchArticleContent(url);

            console.log("Tiêu đề:", title);
            console.log("Nội dung đã xử lý:\n", content);

            if (options.style) console.log("Phong cách:", options.style);
            if (options.category) console.log("Danh mục:", options.category);

            // Kiểm tra và lấy category_id
            let categoryId;
            const categoryQuery = "SELECT id FROM categories WHERE name = $1";
            const categoryRes = await client.query(categoryQuery, [options.category]);

            if (categoryRes.rows.length > 0) {
                categoryId = categoryRes.rows[0].id;
            } else {
                const insertCategoryQuery = "INSERT INTO categories (name) VALUES ($1) RETURNING id";
                const newCategory = await client.query(insertCategoryQuery, [options.category]);
                categoryId = newCategory.rows[0].id;
            }

            // Gửi nội dung qua AI để tạo bài viết
            const style = options.style || "trung lập";
            const aiPrompt = `Bạn là content creater chuyên nghiệp với 50 năm kinh nghiệm. Nhiệm vụ của bạn là hãy viết lại bài có tiêu đề: "${title}" theo phong cách ${style}.
                            Yêu cầu:                                 
                            1. Giữ nguyên ý chính và thông tin quan trọng                                 
                            2. Thay đổi cách diễn đạt để phù hợp với phong cách ${style}                                 
                            3. Đảm bảo bài viết mạch lạc, rõ ràng và hấp dẫn                                 
                            4. Giữ nguyên độ dài tương đối so với bài gốc                                 
                            Nội dung bài viết gốc: ${content}`;

            const generatedContent = await generateContent(aiPrompt);
            const articleText = generatedContent.candidates?.[0]?.content || "Không có dữ liệu";

            console.log("Tạo thành công: \n", articleText);

            // Lưu vào database
            const insertQuery = `
                INSERT INTO posts (category_id, title, content, created_at)
                VALUES ($1, $2, $3, NOW())
            `;

            await client.query(insertQuery, [categoryId, title, articleText]);

            console.log("Lưu thành công!");
        } catch (error) {
            console.error("Lỗi khi crawl:", error.message);
        } finally {
            client.release();
        }
    });
// liệt kê các bài viết
program
    .command("list")
    .description("Liệt kê các bài viết đã tạo")
    .action(async () => {
        const client = await pool.connect();
        try {
            const result = await client.query(`
                SELECT p.id, p.title, c.name AS category, p.created_at
                FROM posts p
                LEFT JOIN categories c ON p.category_id = c.id
                ORDER BY p.created_at DESC
            `);

            const rows = result.rows;

            if (rows.length === 0) {
                console.log("Không có bài viết nào trong database.");
                return;
            }

            console.log("Danh sách bài viết:");
            rows.forEach((post) => {
                console.log(`ID: ${post.id}`);
                console.log(`Tiêu đề: ${post.title}`);
                console.log(`Danh mục: ${post.category}`);
                console.log(`Ngày tạo: ${new Date(post.created_at).toLocaleString()}`);
                console.log("----------------------------------------------------");
            });
        } catch (error) {
            console.error("Lỗi khi truy vấn danh sách bài viết:", error.message);
        } finally {
            client.release();
        }
    });

program.parse(process.argv);

