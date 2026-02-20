const multer = require('multer');

const ALLOWED_MIME_TYPES = [
    // Documents
    'text/plain',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    // Images
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'image/svg+xml',
    // Archives
    'application/zip',
    'application/x-rar-compressed',
    'application/gzip',
    // Videos
    'video/mp4',
    'video/webm',
    'video/ogg',
    'video/quicktime',
    // Code / data
    'application/json',
    'application/xml',
    'text/csv',
    'text/html',
    'text/css',
    'text/javascript',
    'application/javascript',
];

const maxSize = parseInt(process.env.MAX_FILE_SIZE || '26214400'); // 25 MB default

const storage = multer.memoryStorage();

const fileFilter = (_req, file, cb) => {
    if (ALLOWED_MIME_TYPES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`File type "${file.mimetype}" is not allowed.`), false);
    }
};

const upload = multer({
    storage,
    limits: { fileSize: maxSize },
    fileFilter,
});

module.exports = upload;
