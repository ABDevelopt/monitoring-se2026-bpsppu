require('dotenv').config();
const express = require('express');
const path = require('path');
const os = require('os');
const mysql = require('mysql2');

const app = express();

// Phusion Passenger will supply process.env.PORT automatically.
// Local development will fall back to port 3000.
const PORT = process.env.PORT || 3000;

// Setup MySQL Connection Pool (optional configuration)
let pool = null;
const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  port: parseInt(process.env.DB_PORT || '3306'),
  connectionLimit: 5
};

// Check if credentials are provided before initializing connection pool
const isDbConfigured = !!(dbConfig.user && dbConfig.database);
if (isDbConfigured) {
  try {
    pool = mysql.createPool(dbConfig).promise();
    console.log(`📡 Database connection pool initialized for user: ${dbConfig.user}`);
  } catch (err) {
    console.error('⚠️ Failed to initialize MySQL pool:', err.message);
  }
} else {
  console.log('📡 MySQL environment variables not provided. Database checking is running in mock/offline mode.');
}

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Server Status & Database API Endpoint
app.get('/api/status', async (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = ((usedMem / totalMem) * 100).toFixed(1);

    const isPassengerActive = !!process.env.PORT;
    const nodeEnv = process.env.NODE_ENV || 'development';

    // Verify database connection
    let dbStatus = 'not_configured';
    let dbMessage = 'Database environment variables are not set.';
    
    if (isDbConfigured) {
      if (pool) {
        try {
          // Quick query test
          const startTime = Date.now();
          await pool.query('SELECT 1 + 1 AS connection_test');
          const latency = Date.now() - startTime;
          dbStatus = 'connected';
          dbMessage = `Successfully connected to MySQL database. Latency: ${latency}ms`;
        } catch (dbErr) {
          dbStatus = 'error';
          dbMessage = `Database connection error: ${dbErr.message}`;
        }
      } else {
        dbStatus = 'error';
        dbMessage = 'MySQL pool was configured but could not be initialized.';
      }
    }

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime(),
        loadAverage: os.loadavg(),
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
      },
      database: {
        status: dbStatus,
        message: dbMessage,
        config: {
          host: dbConfig.host,
          database: dbConfig.database,
          user: dbConfig.user,
          port: dbConfig.port
        }
      },
      hostingDiagnostics: {
        passengerPortBound: isPassengerActive,
        portUsed: PORT,
        nodeEnvironment: nodeEnv,
        passengerEnv: process.env.PASSENGER_APP_ENV || 'Not detected (Local)',
      },
      hardware: {
        cpus: os.cpus().length,
        cpuModel: os.cpus()[0]?.model || 'Unknown CPU',
        totalMemoryGB: (totalMem / (1024 * 1024 * 1024)).toFixed(2),
        freeMemoryGB: (freeMem / (1024 * 1024 * 1024)).toFixed(2),
        usedMemoryGB: (usedMem / (1024 * 1024 * 1024)).toFixed(2),
        memoryUsagePercentage: memUsagePct
      }
    });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

// Start listening
app.listen(PORT, () => {
  console.log(`==================================================`);
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📂 Serving static files from: ${path.join(__dirname, 'public')}`);
  console.log(`📊 Status API available at: http://localhost:${PORT}/api/status`);
  console.log(`==================================================`);
});
