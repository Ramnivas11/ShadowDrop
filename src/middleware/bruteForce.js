/**
 * Anti-Brute Force middleware for the retrieve endpoint.
 * - Max 5 failed attempts per IP
 * - 30-second cooldown after limit is reached
 * - Resets on successful retrieval
 */

const attempts = new Map(); // key: IP, value: { count, lastAttempt, cooldownUntil }

const BRUTE_FORCE_CONFIG = {
    maxAttempts: 5,
    cooldownMs: 30 * 1000, // 30 seconds
    cleanupIntervalMs: 60 * 1000, // cleanup stale entries every 60s
};

// Periodic cleanup of stale entries
setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of attempts) {
        // Remove entries that have been idle for more than the cooldown period or are fully expired
        if (now - data.lastAttempt > Math.max(BRUTE_FORCE_CONFIG.cooldownMs, 2 * 60 * 1000) && now > data.cooldownUntil) {
            attempts.delete(ip);
        }
    }
}, BRUTE_FORCE_CONFIG.cleanupIntervalMs);

const bruteForceProtection = (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    let record = attempts.get(ip);

    if (!record) {
        record = { count: 0, lastAttempt: now, cooldownUntil: 0 };
        attempts.set(ip, record);
    }

    // Check if in cooldown period
    if (record.cooldownUntil > now) {
        const remainingSec = Math.ceil((record.cooldownUntil - now) / 1000);
        return res.status(429).json({
            success: false,
            message: `Too many failed attempts. Please wait ${remainingSec} seconds.`,
            cooldownRemaining: remainingSec,
            attemptsUsed: record.count,
            maxAttempts: BRUTE_FORCE_CONFIG.maxAttempts,
        });
    }

    // Increment attempt count
    record.count += 1;
    record.lastAttempt = now;

    // Check if max attempts reached
    if (record.count > BRUTE_FORCE_CONFIG.maxAttempts) {
        record.cooldownUntil = now + BRUTE_FORCE_CONFIG.cooldownMs;
        record.count = 0; // reset count after cooldown starts
        const remainingSec = Math.ceil(BRUTE_FORCE_CONFIG.cooldownMs / 1000);
        return res.status(429).json({
            success: false,
            message: `Too many failed attempts. Please wait ${remainingSec} seconds.`,
            cooldownRemaining: remainingSec,
            attemptsUsed: BRUTE_FORCE_CONFIG.maxAttempts,
            maxAttempts: BRUTE_FORCE_CONFIG.maxAttempts,
        });
    }

    // Attach helper to reset on success
    res.on('finish', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
            attempts.delete(ip); // successful retrieval — reset
        }
    });

    // Attach attempts info to request for route to use
    req.bruteForce = {
        attemptsUsed: record.count,
        attemptsRemaining: BRUTE_FORCE_CONFIG.maxAttempts - record.count,
        maxAttempts: BRUTE_FORCE_CONFIG.maxAttempts,
    };

    next();
};

module.exports = bruteForceProtection;
