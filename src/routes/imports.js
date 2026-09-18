const express = require('express');
const multer = require('multer');
const fs = require('fs');
const { getDb, generateId } = require('../db');
const { authenticate } = require('../middleware/auth');

const router = express.Router();

const upload = multer({
  dest: process.env.UPLOAD_DIR || './uploads',
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'), false);
    }
  },
});

router.post('/', authenticate, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({
      error: 'missing_file',
      message: 'A CSV file is required. Send as multipart form data with field name "file"',
    });
  }

  const db = getDb();
  const jobId = generateId();
  const idempotencyKey = req.headers['idempotency-key'] || jobId;
  const userId = req.user.id;

  const existing = db.jobs.find((j) => j.idempotency_key === idempotencyKey && j.user_id === userId);

  if (existing) {
    try { fs.unlinkSync(req.file.path); } catch {}
    return res.status(200).json({
      job_id: existing.id,
      status: existing.status,
      message: 'This request was already processed (idempotent replay)',
    });
  }

  const fileContent = fs.readFileSync(req.file.path, 'utf-8');
  const lines = fileContent.split('\n').filter((l) => l.trim());

  db.jobs.push({
    id: jobId,
    user_id: userId,
    original_filename: req.file.originalname,
    stored_path: req.file.path,
    status: 'pending',
    row_count: lines.length,
    processed_count: 0,
    error_message: null,
    idempotency_key: idempotencyKey,
    created_at: new Date().toISOString(),
    started_at: null,
    completed_at: null,
  });

  for (let i = 0; i < lines.length; i++) {
    db.import_rows.push({
      id: generateId(),
      job_id: jobId,
      row_index: i,
      raw_data: lines[i],
      status: 'pending',
      error_message: null,
    });
  }

  db.persist();

  res.status(202).json({
    job_id: jobId,
    status: 'pending',
    message: 'Import accepted. Processing will happen in the background.',
    row_count: lines.length,
    status_url: `/imports/${jobId}`,
  });
});

router.get('/:id', authenticate, (req, res) => {
  const db = getDb();
  const job = db.jobs.find((j) => j.id === req.params.id && j.user_id === req.user.id);

  if (!job) {
    return res.status(404).json({
      error: 'not_found',
      message: 'Import job not found',
    });
  }

  res.json({
    job_id: job.id,
    status: job.status,
    original_filename: job.original_filename,
    row_count: job.row_count,
    processed_count: job.processed_count,
    error_message: job.error_message,
    created_at: job.created_at,
    started_at: job.started_at,
    completed_at: job.completed_at,
  });
});

router.get('/:id/results', authenticate, (req, res) => {
  const db = getDb();
  const job = db.jobs.find((j) => j.id === req.params.id && j.user_id === req.user.id);

  if (!job) {
    return res.status(404).json({
      error: 'not_found',
      message: 'Import job not found',
    });
  }

  if (job.status !== 'completed' && job.status !== 'completed_with_errors') {
    return res.status(409).json({
      error: 'not_ready',
      message: `Job is "${job.status}", results available when status is "completed"`,
    });
  }

  const rows = db.import_rows.filter((r) => r.job_id === job.id).sort((a, b) => a.row_index - b.row_index);

  res.json({
    job_id: job.id,
    status: job.status,
    row_count: job.row_count,
    rows: rows.map((r) => ({
      index: r.row_index,
      data: r.raw_data,
      status: r.status,
      error: r.error_message,
    })),
  });
});

module.exports = router;
