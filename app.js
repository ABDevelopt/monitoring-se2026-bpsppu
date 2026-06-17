const express = require('express');
const path = require('path');
const os = require('os');

const app = express();

// Phusion Passenger will supply process.env.PORT automatically.
// Local development will fall back to port 3000.
const PORT = process.env.PORT || 3000;

// Serve static assets from 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

// Server Status API Endpoint
app.get('/api/status', (req, res) => {
  try {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const memUsagePct = ((usedMem / totalMem) * 100).toFixed(1);

    // Basic diagnostics for Dewaweb shared hosting
    const isPassengerActive = !!process.env.PORT;
    const nodeEnv = process.env.NODE_ENV || 'development';

    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      system: {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        uptime: os.uptime(), // system uptime in seconds
        loadAverage: os.loadavg(),
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(), // process uptime in seconds
        nodeVersion: process.version,
        memoryUsage: process.memoryUsage(),
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
