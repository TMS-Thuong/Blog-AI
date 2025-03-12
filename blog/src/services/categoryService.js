const CategoryModel = require('../api/models/modelCategory');

const CategoryService = {
    async getAllCategories() {
        return await CategoryModel.getAll();
    },

    async getCategoryById(id) {
        return await CategoryModel.getById(id);
    },

    async createCategory(name) {
        return await CategoryModel.create(name);
    },

    async updateCategory(id, name) {
        return await CategoryModel.update(id, name);
    },

    async deleteCategory(id) {
        return await CategoryModel.delete(id);
    }
};

module.exports = CategoryService;
