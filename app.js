'use strict';

require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const { parseRequirementFile } = require('./parser');
const { createTasksFromSections } = require('./clickup');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const MAX_FILE_SIZE_MB = Number(process.env.MAX_FILE_SIZE_MB) || 5;
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;

const UPLOADS_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Security headers
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'", 'https://cdn.jsdelivr.net'],
        scriptSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        fontSrc: ["'self'", 'https://cdn.jsdelivr.net'],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
      },
    },
  })
);

app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting for upload endpoint
const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many upload requests. Please try again in 15 minutes.',
  },
});

const ALLOWED_MIME_TYPES = new Set([
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
]);

const ALLOWED_EXTENSIONS = new Set(['.docx', '.txt']);

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (_req, file, cb) => {
    const unique = `${Date.now()}-${crypto.randomBytes(8).toString('hex')}`;
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, `${unique}${ext}`);
  },
});

function fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (!ALLOWED_EXTENSIONS.has(ext)) {
    return cb(new Error('Invalid file type. Only .docx and .txt files are allowed.'));
  }

  if (!ALLOWED_MIME_TYPES.has(file.mimetype) && file.mimetype !== 'application/octet-stream') {
    return cb(new Error('Invalid file MIME type. Only DOCX and TXT files are allowed.'));
  }

  cb(null, true);
}

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
  },
});

/**
 * Delete a file safely (ignore errors).
 * @param {string} filePath
 */
function safeUnlink(filePath) {
  if (!filePath) return;
  fs.unlink(filePath, () => {});
}

/**
 * Health check endpoint for load balancers / PM2.
 */
app.get('/api/health', (_req, res) => {
  res.json({
    success: true,
    status: 'ok',
    timestamp: new Date().toISOString(),
  });
});

/**
 * Upload and process requirement document.
 */
app.post('/api/upload', uploadLimiter, (req, res) => {
  upload.single('document')(req, res, async (err) => {
    if (err instanceof multer.MulterError) {
      if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({
          success: false,
          error: `File too large. Maximum allowed size is ${MAX_FILE_SIZE_MB} MB.`,
        });
      }
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    if (err) {
      return res.status(400).json({
        success: false,
        error: err.message,
      });
    }

    if (!req.file) {
      return res.status(400).json({
        success: false,
        error: 'No file uploaded. Please select a .docx or .txt file.',
      });
    }

    const filePath = req.file.path;

    try {
      const sections = await parseRequirementFile(filePath);

      const results = await createTasksFromSections(sections, {
        apiToken: process.env.CLICKUP_API_TOKEN,
        listId: process.env.CLICKUP_LIST_ID,
      });

      const created = results.filter((r) => r.status === 'created').length;
      const failed = results.filter((r) => r.status === 'failed').length;

      return res.json({
        success: failed === 0,
        message:
          failed === 0
            ? `Successfully created ${created} task(s) in ClickUp.`
            : `Created ${created} task(s), ${failed} failed.`,
        summary: {
          total: results.length,
          created,
          failed,
        },
        results,
      });
    } catch (parseErr) {
      return res.status(422).json({
        success: false,
        error: parseErr.message,
      });
    } finally {
      safeUnlink(filePath);
    }
  });
});

// 404 for unknown API routes
app.use('/api/*', (_req, res) => {
  res.status(404).json({
    success: false,
    error: 'API endpoint not found.',
  });
});

// Global error handler
app.use((err, _req, res, _next) => {
  console.error('[ERROR]', err);
  res.status(500).json({
    success: false,
    error: 'An unexpected server error occurred. Please try again later.',
  });
});

app.listen(PORT, () => {
  console.log(`ClickUp Task Portal running on port ${PORT} (${process.env.NODE_ENV || 'development'})`);
});

module.exports = app;
