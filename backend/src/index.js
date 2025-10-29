require('dotenv').config();
const express = require('express');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// simple test route
app.get('/api/ping', (req, res) => {
  res.json({ message: 'pong from backend' });
});

// example POST route
app.post('/api/echo', (req, res) => {
  res.json({ youSent: req.body });
});

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
