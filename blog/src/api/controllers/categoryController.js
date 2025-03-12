const CategoryService = require('../../services/categoryService');

const CategoryController = {
    async getAll(req, res) {
        try {
            const categories = await CategoryService.getAllCategories();
            res.json(categories);
        } catch (error) {
            res.status(500).json({ error: "Lỗi khi lấy danh mục" });
        }
    },

    async getById(req, res) {
        try {
            const category = await CategoryService.getCategoryById(req.params.id);
            if (!category) return res.status(404).json({ error: "Danh mục không tồn tại" });
            res.json(category);
        } catch (error) {
            res.status(500).json({ error: "Lỗi khi lấy danh mục" });
        }
    },

    async create(req, res) {
        try {
            const { name } = req.body;
            if (!name) return res.status(400).json({ error: "Tên danh mục là bắt buộc" });

            const newCategory = await CategoryService.createCategory(name);
            res.status(201).json(newCategory);
        } catch (error) {
            res.status(500).json({ error: "Lỗi khi tạo danh mục" });
        }
    },

    async update(req, res) {
        try {
            const { name } = req.body;
            const { id } = req.params;
            if (!name) return res.status(400).json({ error: "Tên danh mục là bắt buộc" });

            const updatedCategory = await CategoryService.updateCategory(id, name);
            if (!updatedCategory) return res.status(404).json({ error: "Danh mục không tồn tại" });

            res.json(updatedCategory);
        } catch (error) {
            res.status(500).json({ error: "Lỗi khi cập nhật danh mục" });
        }
    },

    async delete(req, res) {
        try {
            const { id } = req.params;
            const deletedCategory = await CategoryService.deleteCategory(id);
            if (!deletedCategory) return res.status(404).json({ error: "Danh mục không tồn tại" });

            res.json({ message: "Xóa danh mục thành công" });
        } catch (error) {
            res.status(500).json({ error: "Lỗi khi xóa danh mục" });
        }
    }
};

module.exports = CategoryController;
