const express = require('express');
const { MongoClient } = require('mongodb');
const { v4: uuidv4 } = require('uuid');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

const app = express();
const PORT = process.env.PORT || 3000;
const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://<username>:<password>@cluster0.mongodb.net/<dbname>?retryWrites=true&w=majority';
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
const BASE_URL = process.env.BASE_URL || 'https://thanhnguyen-ten.vercel.app';

let client;
let db;

// Kết nối MongoDB
async function connectToMongoDB() {
  try {
    client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db('rawlinks_db');
    console.log('Connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  }
}

connectToMongoDB();

// Middleware
app.use(express.json());
app.use((req, res, next) => {
  console.log(`${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// Đọc dữ liệu từ MongoDB
async function readData(collectionName) {
  try {
    const collection = db.collection(collectionName);
    return await collection.find().toArray();
  } catch (err) {
    console.error(`Error reading ${collectionName}:`, err);
    return [];
  }
}

// Ghi dữ liệu vào MongoDB
async function writeData(collectionName, data) {
  try {
    const collection = db.collection(collectionName);
    await collection.deleteMany({});
    if (data.length > 0) {
      await collection.insertMany(data);
    }
  } catch (err) {
    console.error(`Error writing ${collectionName}:`, err);
    throw err;
  }
}

// Middleware kiểm tra JWT
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
}

// Middleware kiểm tra admin
function isAdmin(req, res, next) {
  if (req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

// Route đăng ký
app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const users = await readData('users');
  if (users.find(u => u.username === username)) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const apiKey = uuidv4();
  const user = {
    id: uuidv4(),
    username,
    password: hashedPassword,
    role: 'user',
    apiKey
  };

  users.push(user);
  await writeData('users', users);
  res.json({ message: 'Registered successfully', apiKey });
});

// Route đăng nhập
app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  const users = await readData('users');
  const user = users.find(u => u.username === username);

  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, JWT_SECRET, {
    expiresIn: '1h'
  });
  res.json({ token, role: user.role, apiKey: user.apiKey });
});

// Route tạo link mới
app.post('/api/create', async (req, res) => {
  const { content } = req.body;
  if (!content) {
    return res.status(400).json({ error: 'Content is required' });
  }

  const apiKey = req.headers['x-api-key'];
  if (apiKey) {
    const users = await readData('users');
    if (!users.find(u => u.apiKey === apiKey)) {
      return res.status(401).json({ error: 'Invalid API key' });
    }
  }

  const id = uuidv4();
  const createdAt = new Date().toISOString();
  const link = `${BASE_URL}/raw/${id}`;

  const newEntry = { id, content, createdAt, link };
  const data = await readData('links');
  data.push(newEntry);
  await writeData('links', data);

  res.json({ link });
});

// Route trả về nội dung raw
app.get('/raw/:id', async (req, res) => {
  const { id } = req.params;
  const data = await readData('links');
  const entry = data.find(item => item.id === id);

  if (!entry) {
    return res.status(404).send('Not found');
  }

  res.set('Content-Type', 'text/plain');
  res.send(entry.content);
});

// Route lấy danh sách tất cả link (chỉ admin, dùng JWT)
app.get('/api/links', authenticateToken, isAdmin, async (req, res) => {
  const data = await readData('links');
  res.json(data);
});

// Route xóa link (chỉ admin, dùng JWT)
app.delete('/api/links/:id', authenticateToken, isAdmin, async (req, res) => {
  const { id } = req.params;
  const data = await readData('links');
  const updatedData = data.filter(item => item.id !== id);

  if (data.length === updatedData.length) {
    return res.status(404).json({ error: 'Link not found' });
  }

  await writeData('links', updatedData);
  res.json({ message: 'Link deleted' });
});

// Route xác thực mật khẩu admin cho trang admin.html
app.post('/api/admin-auth', async (req, res) => {
  const { password } = req.body;
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: 'Invalid admin password' });
  }
  const token = jwt.sign({ role: 'admin' }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ token });
});

// Route lấy danh sách link cho trang admin.html
app.get('/api/admin-links', authenticateToken, async (req, res) => {
  const data = await readData('links');
  res.json(data);
});

// Route xóa link cho trang admin.html
app.delete('/api/admin-links/:id', authenticateToken, async (req, res) => {
  const { id } = req.params;
  const data = await readData('links');
  const updatedData = data.filter(item => item.id !== id);

  if (data.length === updatedData.length) {
    return res.status(404).json({ error: 'Link not found' });
  }

  await writeData('links', updatedData);
  res.json({ message: 'Link deleted' });
});

// Xử lý lỗi server
app.use((err, req, res, next) => {
  console.error('Server error:', err.stack);
  res.status(500).json({ error: 'Server error' });
});

// Export cho Vercel Functions
module.exports = app;