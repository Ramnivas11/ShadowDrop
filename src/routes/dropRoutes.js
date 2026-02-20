const express = require('express');
const router = express.Router();
const Drop = require('../models/Drop');
const upload = require('../middleware/upload');
const generateUniqueCode = require('../utils/codeGenerator');
const bruteForceProtection = require('../middleware/bruteForce');
const DOMPurify = require('dompurify');
const { JSDOM } = require('jsdom');

const window = new JSDOM('').window;
const purify = DOMPurify(window);

// ────────────────────────────────────────────
// POST /api/drops/text — Create a text drop
// ────────────────────────────────────────────
router.post('/text', async (req, res, next) => {
    try {
        const { text } = req.body;

        if (!text || typeof text !== 'string' || text.trim().length === 0) {
            return res.status(400).json({ success: false, message: 'Text content is required.' });
        }

        if (text.length > 50000) {
            return res.status(400).json({ success: false, message: 'Text exceeds 50 000 character limit.' });
        }

        // Sanitize input to prevent XSS
        const sanitizedText = purify.sanitize(text.trim());

        const code = await generateUniqueCode();

        await Drop.create({
            code,
            type: 'text',
            textContent: sanitizedText,
        });

        res.status(201).json({ success: true, code });
    } catch (error) {
        next(error);
    }
});

// ────────────────────────────────────────────
// POST /api/drops/file — Upload a file drop
// ────────────────────────────────────────────
router.post('/file', upload.single('file'), async (req, res, next) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'A file is required.' });
        }

        // Validate Magic Numbers (Buffer Signature)
        const fileType = await import('file-type');
        const bufferInfo = await fileType.fileTypeFromBuffer(req.file.buffer);

        // ALLOWED_MIME_TYPES from upload.js logic repeated here for exact buffer match
        // Note: Some text files (csv, txt, html) don't have magic numbers and return null
        if (bufferInfo) {
            const allowedUploads = [
                'application/pdf', 'image/jpeg', 'image/png', 'image/gif', 'image/webp',
                'application/zip', 'application/x-rar-compressed', 'application/gzip',
                'application/json', 'application/xml' // partial list based on common binary/structured formats
            ];

            // If it has a magic number, verify it's one we allow or matches the multer mimetype roughly
            // Because file-type doesn't cover all text mimetypes, we only reject if it's a known restricted binary
            const isExecutable = bufferInfo.mime.startsWith('application/x-msdownload') ||
                bufferInfo.mime.startsWith('application/x-executable');

            if (isExecutable) {
                return res.status(400).json({ success: false, message: 'Executable files are not allowed.' });
            }
        }

        const code = await generateUniqueCode();

        // Sanitize filename
        const safeFileName = req.file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');

        await Drop.create({
            code,
            type: 'file',
            fileName: safeFileName,
            fileMimeType: req.file.mimetype,
            fileData: req.file.buffer,
        });

        res.status(201).json({ success: true, code });
    } catch (error) {
        next(error);
    }
});

// ────────────────────────────────────────────
// GET /api/drops/:code — Retrieve & delete a drop (one-time access)
// Protected by anti-brute-force middleware
// ────────────────────────────────────────────
router.get('/:code', bruteForceProtection, async (req, res, next) => {
    try {
        const { code } = req.params;

        // Validate code format
        if (!/^\d{6}$/.test(code)) {
            return res.status(400).json({ success: false, message: 'Invalid code format. Must be 6 digits.' });
        }

        // Atomic find-and-delete — guarantees one-time access
        const drop = await Drop.findOneAndDelete({ code });

        if (!drop) {
            return res.status(404).json({
                success: false,
                message: 'Drop not found. It may have expired or already been accessed.',
                attemptsRemaining: req.bruteForce ? req.bruteForce.attemptsRemaining : undefined,
            });
        }

        if (drop.type === 'text') {
            return res.json({
                success: true,
                type: 'text',
                content: drop.textContent,
            });
        }

        // File drop — send as download
        res.set({
            'Content-Type': drop.fileMimeType,
            'Content-Disposition': `attachment; filename="${encodeURIComponent(drop.fileName)}"`,
            'Content-Length': drop.fileData.length,
        });
        return res.send(drop.fileData);
    } catch (error) {
        next(error);
    }
});

module.exports = router;
