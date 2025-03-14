#!/usr/bin/env node

const { Command } = require("commander");
const fs = require("fs");
const cron = require("node-cron");
const { fetchArticleContent } = require("../services/crawl");
const { generateContent } = require("../services/googleStudioService");
const pool = require("../../config/db");
const { processCSV } = require("../api/controllers/blogController");

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

            // Fetch nội dung từ URL
            let { title, content } = await fetchArticleContent(url);
            if (!title || title.trim() === "") {
                title = "Không có tiêu đề";
            }
            if (options.style) console.log("Phong cách:", options.style);
            if (options.category) console.log("Danh mục:", options.category);

            // Kiểm tra danh mục bài viết
            let categoryId = null;
            if (options.category) {
                const categoryQuery = "SELECT id FROM categories WHERE name = $1";
                const categoryRes = await client.query(categoryQuery, [options.category]);

                if (categoryRes.rows.length > 0) {
                    categoryId = categoryRes.rows[0].id;
                } else {
                    const insertCategoryQuery = "INSERT INTO categories (name) VALUES ($1) RETURNING id";
                    const newCategory = await client.query(insertCategoryQuery, [options.category]);
                    categoryId = newCategory.rows[0].id;
                }
            }

            // Gửi nội dung đến AI để tạo bài viết (truyền tham số đầu vào)
            const style = options.style || "trung lập";
            const generatedContent = await generateContent({ title, content, style });
            const articleText = generatedContent || "Không có dữ liệu";

            console.log("Phản hồi từ AI:", JSON.stringify(generatedContent, null, 2));

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
            const result = await client.query(` SELECT p.id, p.title, c.name AS category, p.created_at, p.content
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
                console.log('Nội dung: ', post.content);
                console.log(`Ngày tạo: ${new Date(post.created_at).toLocaleString()}`);
                console.log("----------------------------------------------------");
            });
        } catch (error) {
            console.error("Lỗi khi truy vấn danh sách bài viết:", error.message);
        } finally {
            client.release();
        }
    });
// 2.3.bloggen batch < csv - file >: Xử lý hàng loạt từ file CSV
program
    .command("batch <csvFile>")
    .description("Xử lý hàng loạt bài viết từ file CSV")
    .action(async (csvFile) => {
        try {
            console.log(`Đọc file CSV: ${csvFile}`);
            const articles = await processCSV(csvFile);
            if (articles.length === 0) {
                console.log("Không có dữ liệu trong file CSV.");
                return;
            }

            const client = await pool.connect();
            try {
                await client.query("BEGIN");

                // Lấy danh sách danh mục trước
                const categoryResults = await client.query("SELECT id, name FROM categories");
                const categoryMap = new Map(categoryResults.rows.map(row => [row.name, row.id]));

                for (const article of articles) {
                    const { category, url, style } = article;
                    if (!category || !url || !style) {
                        console.warn("Bỏ qua dòng bị lỗi:", article);
                        continue;
                    }

                    // Xử lý category
                    let categoryId = categoryMap.get(category);
                    if (!categoryId) {
                        const insertCategory = await client.query(
                            "INSERT INTO categories (name) VALUES ($1) RETURNING id",
                            [category]
                        );
                        categoryId = insertCategory.rows[0].id;
                        categoryMap.set(category, categoryId);
                    }

                    // Crawl nội dung
                    let title = "";
                    let content = "";
                    try {
                        ({ title, content } = await fetchArticleContent(url));
                    } catch (error) {
                        console.error(`Lỗi khi crawl dữ liệu từ ${url}:`, error);
                        continue;
                    }

                    if (!content || content.length < 100) {
                        console.warn(`Bỏ qua bài viết có nội dung quá ngắn: ${title}`);
                        continue;
                    }
                    const rewrittenContent = await generateContent({ title, content, style });
                    if (!rewrittenContent) {
                        console.error(`AI Service không thể viết lại bài: ${title}`);
                        continue;
                    }
                    console.log("Nội dung viết lại:", rewrittenContent);
                    // Lưu vào database
                    await client.query(
                        "INSERT INTO posts (title, content, category_id, created_at) VALUES ($1, $2, $3, NOW())",
                        [title, rewrittenContent, categoryId]
                    );

                    console.log('Bài viết đã được xử lý và lưu.');
                }

                await client.query("COMMIT");
                console.log("Hoàn thành xử lý tất cả bài viết.");
            } catch (error) {
                await client.query("ROLLBACK");
                console.error("Lỗi khi lưu bài viết:", error);
            } finally {
                client.release();
            }
        } catch (error) {
            console.error("Lỗi hệ thống:", error);
        }
    });

program
    .command("export")
    .description("Xuất bài viết ra file")
    .option("--format <format>", "Định dạng xuất (json, md, html)", "json")
    .option("--output <output>", "Đường dẫn file output")
    .action(async (options) => {
        const { format, output } = options;
        if (!output) {
            console.error("Vui lòng cung cấp đường dẫn file output bằng --output=<file>");
            return;
        }

        const client = await pool.connect();
        try {
            const result = await client.query(` SELECT p.id, p.title, c.name AS category, p.content, p.created_at
                                                FROM posts p
                                                LEFT JOIN categories c ON p.category_id = c.id
                                                ORDER BY p.created_at DESC`);
            const posts = result.rows;

            if (posts.length === 0) {
                console.log("Không có bài viết nào để xuất.");
                return;
            }

            let outputContent = "";
            if (format === "json") {
                outputContent = JSON.stringify(posts, null, 2);
            } else if (format === "md") {
                outputContent = posts.map(post => `# ${post.title}\n\n**Danh mục**: ${post.category}\n\n${post.content}`).join("\n\n---\n\n");
            } else if (format === "html") {
                outputContent = `<!DOCTYPE html>
                                <html>
                                <head>
                                    <meta charset='UTF-8'>
                                    <title>Bài viết</title>
                                </head>
                                <body>
                                    <h1>Danh sách Bài viết</h1>
                                    ${posts.map(post => `
                                    <article>
                                        <h3>Danh mục: ${post.category}</h2>
                                        <h3>Tiêu đề : ${post.title}</h2>
                                        <p>Nội dung: ${post.content}</p>
                                    </article>
                                    `).join("\n")} 
                                </body>
                                </html>`;
            } else {
                console.error("Định dạng không hợp lệ. Chỉ hỗ trợ json, md, html.");
                return;
            }

            fs.writeFileSync(output, outputContent, "utf8");
            console.log(`Xuất bài viết thành công ra file: ${output}`);
        } catch (error) {
            console.error("Lỗi khi xuất bài viết:", error.message);
        } finally {
            client.release();
        }
    });
// Lên lịch crawl tự động
program
    .command("schedule")
    .description("Lên lịch crawl tự động")
    .option("--cron <cron>", "Biểu thức cron để lên lịch")
    .option("--csv <csv>", "Đường dẫn file CSV chứa dữ liệu crawl")
    .action(async (options) => {
        const { cron: cronExpr, csv } = options;
        if (!cronExpr || !csv) {
            console.error("Vui lòng cung cấp cả biểu thức cron và đường dẫn file CSV.");
            return;
        }

        console.log(`Lên lịch crawl với cron '${cronExpr}' từ file CSV: ${csv}`);
        cron.schedule(cronExpr, async () => {
            console.log("Chạy crawl hàng loạt từ file CSV...");
            await program.parseAsync(["node", "bloggen", "batch", csv]);
        });
        console.log("Lịch trình đã được thiết lập, chương trình sẽ chạy nền.");
    });

program.parse(process.argv);