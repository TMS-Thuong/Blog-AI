const puppeteer = require('puppeteer');
const natural = require('natural');
const stopword = require('stopword');
const emoji = require('emoji-dictionary');

const tokenizer = new natural.WordTokenizer();
const stemmer = natural.PorterStemmer;

// Hàm tiền xử lý văn bản
function preprocessText(text) {
    // 1. Chuyển tất cả văn bản thành chữ thường để đảm bảo nhất quán
    text = text.toLowerCase();
    // 2. Loại bỏ URL (các đường link website)
    text = text.replace(/https?:\/\/\S+|www\.\S+/g, '');
    // 3. Xóa dấu câu để tránh ảnh hưởng đến quá trình phân tích từ
    text = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
    // 4. Xóa các chữ số vì thông thường không cần thiết trong xử lý ngôn ngữ
    text = text.replace(/\d+/g, '');
    // 5. Chuyển biểu tượng cảm xúc (emoji) thành dạng văn bản mô tả
    text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, (match) => emoji.getName(match) || match);
    // 6. Tách từ (Tokenizing) để phân chia văn bản thành các từ riêng lẻ
    let tokens = tokenizer.tokenize(text);
    // 7. Loại bỏ các từ dừng (Stop Words) như "the", "is", "and",... 
    tokens = stopword.removeStopwords(tokens);
    // 8. Chuẩn hóa từ bằng phương pháp Stemming (chuyển về gốc của từ)
    tokens = tokens.map(word => stemmer.stem(word));
    // 9. Kết hợp lại thành văn bản đã được tiền xử lý
    return tokens.join(' ');
}

// Hàm sử dụng Puppeteer để crawl nội dung
async function fetchArticleContent(url) {
    const browser = await puppeteer.launch({
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
    });

    const page = await browser.newPage();
    await page.setDefaultNavigationTimeout(120000);

    try {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 120000 });

        // Kiểm tra nếu trang web không có nội dung hợp lệ
        const pageContent = await page.content();
        if (!pageContent.includes('<p') && !pageContent.includes('<article')) {
            throw new Error("Trang web không có nội dung bài viết hợp lệ.");
        }

        // Lấy tiêu đề bài viết
        let title = "Không tìm thấy tiêu đề";
        try {
            title = await page.$eval('h1', el => el.innerText.trim());
        } catch (error) {
            title = await page.title();
        }

        // Lấy nội dung bài viết
        const content = await page.evaluate(() => {
            const article = document.querySelector('article');
            if (article) return article.innerText.trim();
            return Array.from(document.querySelectorAll('p'))
                .map(p => p.innerText.trim())
                .filter(text => text.length > 50)
                .join('\n');
        });

        if (!title || !content) throw new Error("Không tìm thấy nội dung bài viết");

        const processedContent = preprocessText(content);
        await browser.close();
        return { title, content: processedContent };
    } catch (error) {
        await browser.close();
        console.error("Lỗi khi crawl dữ liệu:", error.message);
        throw new Error("Không thể lấy nội dung bài viết từ URL.");
    }
}

module.exports = { fetchArticleContent };
