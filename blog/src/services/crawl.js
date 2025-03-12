const puppeteer = require('puppeteer');
const natural = require('natural');
const emoji = require('emoji-dictionary');

const stemmer = natural.PorterStemmer;

// Hàm tiền xử lý văn bản
function preprocessText(text) {
    text = text.toLowerCase();
    text = text.replace(/https?:\/\/\S+|www\.\S+/g, '');
    text = text.replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '');
    text = text.replace(/\d+/g, '');
    text = text.replace(/[\u{1F600}-\u{1F64F}]/gu, (match) => emoji.getName(match) || match);

    let tokens = text.replace(/[^\w\s]/g, "").split(/\s+/);
    tokens = tokens.map(word => stemmer.stem(word));

    return tokens.join(' ');
}

async function fetchArticleContent(url) {
    const browser = await puppeteer.launch({
        headless: false
    });

    try {
        const page = await browser.newPage();
        await page.setUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36 Edg/134.0.100.0");
        await page.setDefaultNavigationTimeout(120000);
        await page.goto(url);

        const pageText = await page.evaluate(() => document.body.innerText);
        if (!pageText || pageText.length < 100) {
            throw new Error("Trang không có nội dung hoặc bị bảo vệ.");
        }
        let title = "Không tìm thấy tiêu đề";
        try {
            title = await page.$eval("h1", (el) => el.innerText.trim());
        } catch {
            title = await page.title();
        }
        const content = await page.evaluate(() => {
            const article = document.querySelector("article");
            if (article) return article.innerText.trim();
            return Array.from(document.querySelectorAll("p"))
                .map((p) => p.innerText.trim())
                .filter((text) => text.length > 50)
                .join("\n");
        });

        if (!content) throw new Error("Không tìm thấy nội dung bài viết");

        const processedContent = preprocessText(content);
        await page.close();
        return { title, content: processedContent };
    } catch (error) {
        console.error("Lỗi khi crawl dữ liệu:", error.message);
        return { error: "Không thể lấy nội dung bài viết từ URL." };
    } finally {
        await browser.close();
    }
}

module.exports = { fetchArticleContent };
