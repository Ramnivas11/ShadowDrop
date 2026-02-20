const crypto = require('crypto');
const Drop = require('../models/Drop');

/**
 * Generate a cryptographically random 6-digit numeric code.
 * Checks for collisions before returning.
 */
const generateUniqueCode = async () => {
    const MAX_ATTEMPTS = 10;

    for (let i = 0; i < MAX_ATTEMPTS; i++) {
        // Generate random number between 100000 and 999999
        const code = String(crypto.randomInt(100000, 999999));

        const existing = await Drop.findOne({ code });
        if (!existing) return code;
    }

    throw new Error('Failed to generate a unique code. Please try again.');
};

module.exports = generateUniqueCode;
