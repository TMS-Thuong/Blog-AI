const { GoogleGenerativeAI } = require("@google/generative-ai");

const apiKey = process.env.GEMINI_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

const model = genAI.getGenerativeModel({
    model: "gemini-2.0-flash",
    systemInstruction: "Bạn là content creator chuyên nghiệp với 50 năm kinh nghiệm. Nhiệm vụ của bạn là viết lại bài theo phong cách được yêu cầu.",
});

const generationConfig = {
    temperature: 1,
    topP: 0.95,
    topK: 40,
    maxOutputTokens: 8192,
    responseMimeType: "text/plain",
};

/**
 * Gọi AI để viết lại bài
 * @param {Object} article - Bài viết cần viết lại
 * @param {string} article.title - Tiêu đề bài viết
 * @param {string} article.content - Nội dung gốc
 * @param {string} article.style - Phong cách viết
 * @returns {Promise<string>} - Nội dung bài viết đã viết lại
 */
async function generateContent({ title, content, style }) {
    try {
        const chatSession = model.startChat({
            generationConfig,
            history: [],
        });

        // console.log("Gửi AI:", { title, content, style });

        const result = await chatSession.sendMessage(`Phong cách: ${style}\n\nNội dung gốc: \n${content}`);

        const responseText = result?.response?.candidates?.[0]?.content?.parts?.[0]?.text;

        // console.log("phản hồi:", { responseText });
        if (!responseText) throw new Error("Response không chứa nội dung hợp lệ!");

        return responseText;

    } catch (error) {
        console.error("Lỗi khi gọi AI:", error);
        return null;
    }
}

module.exports = { generateContent };