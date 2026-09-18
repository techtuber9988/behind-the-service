function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'missing_credentials',
      message: 'Authorization header with Bearer token is required',
    });
  }

  const token = authHeader.split(' ')[1];

  try {
    const jwt = require('jsonwebtoken');
    const { getDb } = require('../db');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    const db = getDb();
    const user = db.users.find((u) => u.id === decoded.userId);

    if (!user) {
      return res.status(401).json({
        error: 'invalid_token',
        message: 'Token is valid but user no longer exists',
      });
    }

    req.user = { id: user.id, email: user.email };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({
        error: 'token_expired',
        message: 'Token has expired, please log in again',
      });
    }
    return res.status(401).json({
      error: 'invalid_token',
      message: 'Token is invalid',
    });
  }
}

module.exports = { authenticate };
