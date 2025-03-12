const db = require('./config/db');

async function testConnection() {
    try {
        const result = await db.query('SELECT NOW()');
        console.log('Database connection successful:', result.rows[0]);
    } catch (error) {
        console.error('Database connection failed:', error.message);
    }
}

testConnection();
