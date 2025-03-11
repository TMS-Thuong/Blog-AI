const axios = require('axios');
require('dotenv').config();
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;

async function generateContent(prompt) {
    try {
        const response = await axios.post(GEMINI_API_URL, {
            contents: [
                {
                    parts: [{ text: prompt }]
                }
            ]
        }, {
            headers: { 'Content-Type': 'application/json' }
        });

        return response.data;
    } catch (error) {
        console.error("Error calling Google Gemini API:", error.response?.data || error.message);
        throw new Error("Failed to fetch response from Gemini API.");
    }
}

module.exports = { generateContent };
