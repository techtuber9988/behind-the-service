const express = require('express');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { getDb, generateId } = require('../db');

const router = express.Router();

router.post('/register', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Email and password are required',
    });
  }

  if (password.length < 8) {
    return res.status(400).json({
      error: 'weak_password',
      message: 'Password must be at least 8 characters',
    });
  }

  const db = getDb();
  const existing = db.get('users').find({ email }).value();

  if (existing) {
    return res.status(409).json({
      error: 'email_taken',
      message: 'An account with this email already exists',
    });
  }

  const id = generateId();
  const passwordHash = await bcrypt.hash(password, 10);

  db.get('users').push({ id, email, password_hash: passwordHash, created_at: new Date().toISOString() }).write();

  const token = jwt.sign({ userId: id, email }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.status(201).json({
    user: { id, email },
    token,
  });
});

router.post('/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({
      error: 'missing_fields',
      message: 'Email and password are required',
    });
  }

  const db = getDb();
  const user = db.get('users').find({ email }).value();

  if (!user) {
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Invalid email or password',
    });
  }

  const valid = await bcrypt.compare(password, user.password_hash);

  if (!valid) {
    return res.status(401).json({
      error: 'invalid_credentials',
      message: 'Invalid email or password',
    });
  }

  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_SECRET, { expiresIn: '7d' });

  res.json({
    user: { id: user.id, email: user.email },
    token,
  });
});

module.exports = router;
