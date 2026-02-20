const mongoose = require('mongoose');

const dropSchema = new mongoose.Schema({
    code: {
        type: String,
        required: true,
        unique: true,
        index: true,
        minlength: 6,
        maxlength: 6,
    },
    type: {
        type: String,
        enum: ['text', 'file'],
        required: true,
    },
    // --- Text drops ---
    textContent: {
        type: String,
        maxlength: 50000, // 50 KB of text
    },
    // --- File drops ---
    files: [{
        fileName: String,
        fileMimeType: String,
        fileData: Buffer,
    }],
    // --- Metadata ---
    createdAt: {
        type: Date,
        default: Date.now,
        expires: parseInt(process.env.EXPIRY_MINUTES || '5') * 60, // TTL in seconds
    },
});

module.exports = mongoose.model('Drop', dropSchema);
