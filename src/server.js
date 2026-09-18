const express = require('express');
const cors = require('cors');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const importRoutes = require('./routes/imports');
const { initDatabase } = require('./db');
const { startWorker } = require('./worker');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

app.use('/auth', authRoutes);
app.use('/imports', importRoutes);

app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err.message, err.stack);
  res.status(err.status || 500).json({
    error: err.errorCode || 'internal_error',
    message: err.message || 'An unexpected error occurred',
  });
});

async function main() {
  initDatabase();
  startWorker();

  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

main().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
