const pool = require('../../../config/db');

const CategoryModel = {
    async getAll() {
        const result = await pool.query("SELECT * FROM categories ORDER BY id DESC");
        return result.rows;
    },

    async getById(id) {
        const result = await pool.query("SELECT * FROM categories WHERE id = $1", [id]);
        return result.rows[0] || null;
    },

    async create(name) {
        const result = await pool.query(
            "INSERT INTO categories (name) VALUES ($1) RETURNING *",
            [name]
        );
        return result.rows[0];
    },

    async update(id, name) {
        const result = await pool.query(
            "UPDATE categories SET name = $1 WHERE id = $2 RETURNING *",
            [name, id]
        );
        return result.rows[0] || null;
    },

    async delete(id) {
        const result = await pool.query("DELETE FROM categories WHERE id = $1 RETURNING *", [id]);
        return result.rows[0] || null;
    }
};

module.exports = CategoryModel;
