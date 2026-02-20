require('dotenv').config();

const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const path = require('path');
const morgan = require('morgan');
const connectDB = require('./src/config/db');
const dropRoutes = require('./src/routes/dropRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// ─── Logging ────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
    app.use(morgan('combined')); // Detailed Apache standard format
}

// ─── Trust Proxy (for load balancers & rate limiting) ───
app.set('trust proxy', 1);

// ─── Security ───────────────────────────────
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'"], // Needed for our simple app.js
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:"],
            connectSrc: ["'self'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: [],
        },
    },
    crossOriginEmbedderPolicy: false, // Can break some font loading if strict
}));
app.use(cors());

// ─── Rate Limiting ──────────────────────────
const apiLimiter = rateLimit({
    windowMs: 1 * 60 * 1000, // 1 minute
    max: 30, // Slightly higher to account for normal use + static assets if they hit this route
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res, next, options) => {
        res.status(options.statusCode).json({ success: false, message: options.message.message });
    },
    message: { success: false, message: 'Too many requests. Please try again later.' },
});
app.use('/api/', apiLimiter);

// ─── Body parsing ───────────────────────────
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));

// ─── Static frontend ───────────────────────
app.use(express.static(path.join(__dirname, 'public')));

// ─── API Routes ─────────────────────────────
app.use('/api/drops', dropRoutes);

// ─── Catch-all → serve index.html ──────────
app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// ─── Global Error Handler ───────────────────
app.use((err, _req, res, _next) => {
    console.error('Error:', err.message);

    // Multer file-size error
    if (err.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ success: false, message: 'File too large. Maximum size is 10 MB.' });
    }

    // Multer / validation error
    if (err.message && err.message.includes('not allowed')) {
        return res.status(400).json({ success: false, message: err.message });
    }

    res.status(500).json({ success: false, message: 'Internal server error.' });
});

// ─── Start ──────────────────────────────────
// Connect to the database (Mongoose handles queuing queries until connected)
connectDB();

// Only listen on a port if we're not running in a Serverless environment like Vercel
if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
        console.log(`Open http://localhost:${PORT}`);
    });
}

// Export for serverless environments (Vercel)
module.exports = app;
