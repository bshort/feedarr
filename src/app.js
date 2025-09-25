require('dotenv').config();
const express = require('express');
const rssRoutes = require('./api/routes/rss');
const scheduler = require('./api/services/scheduler');
const database = require('./config/database');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// RSS routes
app.use('/rss', rssRoutes);

app.get('/', (req, res) => {
  res.json({
    message: 'Welcome to Feedarr API',
    description: 'RSS feed generator for media server APIs',
    status: 'Server is running',
    environment: process.env.NODE_ENV || 'development',
    version: '1.0.0',
    endpoints: {
      rssFeeds: `${req.protocol}://${req.get('host')}/rss`,
      health: `${req.protocol}://${req.get('host')}/health`,
      status: `${req.protocol}://${req.get('host')}/rss/status`
    }
  });
});

app.get('/health', async (req, res) => {
  try {
    const schedulerStatus = await scheduler.getStatus();

    res.status(200).json({
      status: 'OK',
      timestamp: new Date().toISOString(),
      server: {
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        pid: process.pid
      },
      scheduler: {
        isRunning: schedulerStatus.isRunning,
        lastFetchTimes: schedulerStatus.lastFetchTimes,
        database: schedulerStatus.database
      },
      configuration: {
        serverUrl: process.env.SERVER_URL,
        serverPort: process.env.SERVER_PORT,
        fetchFrequency: process.env.FETCH_FREQUENCY,
        cacheTimeToLive: process.env.RSS_CACHE_TTL
      }
    });
  } catch (error) {
    console.error('Error getting health status:', error.message);
    res.status(500).json({
      status: 'ERROR',
      timestamp: new Date().toISOString(),
      error: error.message
    });
  }
});

app.use('*', (req, res) => {
  res.status(404).json({
    error: 'Route not found',
    availableRoutes: [
      'GET /',
      'GET /health',
      'GET /rss',
      'GET /rss/calendar',
      'GET /rss/notification',
      'GET /rss/queue',
      'GET /rss/status',
      'POST /rss/refresh',
      'POST /rss/refresh/{feedType}'
    ]
  });
});

// Global error handler
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
  });
});

// Graceful shutdown
const gracefulShutdown = async (signal) => {
  console.log(`${signal} received, shutting down gracefully...`);
  try {
    scheduler.stop();
    await database.close();
    console.log('Shutdown complete');
    process.exit(0);
  } catch (error) {
    console.error('Error during shutdown:', error.message);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

const server = app.listen(PORT, async () => {
  console.log(`Feedarr RSS Service started`);
  console.log(`Server: http://localhost:${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`Target Server: ${process.env.SERVER_URL}:${process.env.SERVER_PORT}`);
  console.log(`Fetch Frequency: ${parseInt(process.env.FETCH_FREQUENCY) / 1000 / 60} minutes`);

  try {
    // Initialize database
    await database.initialize();
    console.log('Database initialized successfully');

    // Start the RSS scheduler
    scheduler.start();
  } catch (error) {
    console.error('Failed to initialize application:', error.message);
    process.exit(1);
  }
});

module.exports = server;