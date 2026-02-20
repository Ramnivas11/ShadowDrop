const express = require('express');
const router = express.Router();
const Drop = require('../models/Drop');
const upload = require('../middleware/upload');
const generateUniqueCode = require('../utils/codeGenerator');
const bruteForceProtection = require('../middleware/bruteForce');
const sanitizeHtml = require('sanitize-html');

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

        // Sanitize input to prevent XSS (strip all HTML tags safely)
        const sanitizedText = sanitizeHtml(text.trim(), {
            allowedTags: [],
            allowedAttributes: {}
        });

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
// POST /api/drops/file — Upload file(s)
// ────────────────────────────────────────────
router.post('/file', upload.array('files', 10), async (req, res, next) => {
    try {
        if (!req.files || req.files.length === 0) {
            return res.status(400).json({ success: false, message: 'At least one file is required.' });
        }

        // Validate Magic Numbers for all files
        const fileType = require('file-type');
        const processedFiles = [];

        for (const file of req.files) {
            const bufferInfo = await fileType.fromBuffer(file.buffer);

            if (bufferInfo) {
                const isExecutable = bufferInfo.mime.startsWith('application/x-msdownload') ||
                    bufferInfo.mime.startsWith('application/x-executable');

                if (isExecutable) {
                    return res.status(400).json({ success: false, message: 'Executable files are not allowed.' });
                }
            }

            // Sanitize filename
            const safeFileName = file.originalname.replace(/[^a-zA-Z0-9.\-_]/g, '_');

            processedFiles.push({
                fileName: safeFileName,
                fileMimeType: file.mimetype,
                fileData: file.buffer
            });
        }

        const code = await generateUniqueCode();

        await Drop.create({
            code,
            type: 'file',
            files: processedFiles
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
        if (drop.files && drop.files.length === 1) {
            // Single file
            const file = drop.files[0];
            res.set({
                'Content-Type': file.fileMimeType,
                'Content-Disposition': `attachment; filename="${encodeURIComponent(file.fileName)}"`,
                'Content-Length': file.fileData.length,
            });
            return res.send(file.fileData);
        } else if (drop.files && drop.files.length > 1) {
            // Multiple files -> ZIP archive
            const archiver = require('archiver');

            res.set({
                'Content-Type': 'application/zip',
                'Content-Disposition': `attachment; filename="shadowdrop-${code}.zip"`
            });

            const archive = archiver('zip', {
                zlib: { level: 9 } // maximum compression
            });

            archive.on('error', function (err) {
                throw err;
            });

            // Pipe archive data to the response
            archive.pipe(res);

            // Append each file buffer to the archive
            drop.files.forEach(file => {
                archive.append(file.fileData, { name: file.fileName });
            });

            await archive.finalize();
            return;
        } else {
            return res.status(404).json({ success: false, message: 'Files not found in drop.' });
        }
    } catch (error) {
        next(error);
    }
});

module.exports = router;
