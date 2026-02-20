const mongoose = require('mongoose');

// Global cache for serverless environments to prevent multiple connections
let cachedDb = null;

const connectDB = async () => {
  if (cachedDb) {
    console.log('MongoDB already connected (reusing cached connection promise)');
    return cachedDb;
  }

  if (mongoose.connection.readyState >= 1) {
    console.log('MongoDB already connected (reusing existing connection state)');
    return mongoose.connection;
  }

  try {
    // MongoDB Atlas Serverless Best Practices
    const options = {
      maxPoolSize: 10, // Low pool size since serverless scales horizontally, preventing connection exhaustion
      minPoolSize: 0, // Don't maintain idle connections
      serverSelectionTimeoutMS: 5000, // Fast failure (5s vs 30s default)
      socketTimeoutMS: 45000, // Close sockets after 45 seconds
    };

    const conn = await mongoose.connect(process.env.MONGODB_URI, options);
    console.log(`MongoDB connected: ${conn.connection.host}`);

    cachedDb = conn.connection;
    return cachedDb;

  } catch (error) {
    console.error(`MongoDB connection error: ${error.message}`);
    // Do not exit process in serverless, let the function fail naturally to allow rapid recovery
    if (process.env.NODE_ENV !== 'production' || !process.env.VERCEL) {
      process.exit(1);
    }
  }
};

module.exports = connectDB;
