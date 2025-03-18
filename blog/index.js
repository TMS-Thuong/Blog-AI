const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const blogRoutes = require('./src/api/routes/blog');
const categoryRoutes = require('./src/api/routes/category');

dotenv.config();
const app = express();

app.use(express.json());
app.use(cors());
app.use('/api/blog', blogRoutes);
app.use('/api/categories', categoryRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
