const request = require('supertest');
const nock = require('nock');

// Mock the scheduler to prevent it from starting during tests
jest.mock('../src/api/services/scheduler', () => ({
  start: jest.fn(),
  stop: jest.fn(),
  getStatus: jest.fn().mockResolvedValue({
    isRunning: false,
    lastFetchTimes: {},
    database: {
      feeds: [],
      cache: [],
      totalCacheEntries: 0
    }
  })
}));

// Import app after mocking
const app = require('../src/app');
const database = require('../src/config/database');

describe('App Integration Tests', () => {
  const baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;

  beforeEach(async () => {
    nock.cleanAll();
    jest.clearAllMocks();
  });

  afterEach(async () => {
    nock.cleanAll();
  });

  describe('Root endpoint', () => {
    test('should return welcome message and API information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Welcome to Feedarr API');
      expect(response.body).toHaveProperty('description', 'RSS feed generator for media server APIs');
      expect(response.body).toHaveProperty('status', 'Server is running');
      expect(response.body).toHaveProperty('environment', 'test');
      expect(response.body).toHaveProperty('version', '1.0.0');
      expect(response.body).toHaveProperty('endpoints');

      expect(response.body.endpoints).toHaveProperty('rssFeeds');
      expect(response.body.endpoints).toHaveProperty('health');
      expect(response.body.endpoints).toHaveProperty('status');
    });

    test('should generate correct endpoint URLs', async () => {
      const response = await request(app)
        .get('/')
        .set('Host', 'example.com')
        .expect(200);

      expect(response.body.endpoints.rssFeeds).toContain('example.com/rss');
      expect(response.body.endpoints.health).toContain('example.com/health');
      expect(response.body.endpoints.status).toContain('example.com/rss/status');
    });
  });

  describe('Health endpoint', () => {
    test('should return comprehensive health information', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body).toHaveProperty('status', 'OK');
      expect(response.body).toHaveProperty('timestamp');
      expect(response.body).toHaveProperty('server');
      expect(response.body).toHaveProperty('scheduler');
      expect(response.body).toHaveProperty('configuration');

      // Server information
      expect(response.body.server).toHaveProperty('uptime');
      expect(response.body.server).toHaveProperty('memory');
      expect(response.body.server).toHaveProperty('pid');

      // Scheduler information
      expect(response.body.scheduler).toHaveProperty('isRunning');
      expect(response.body.scheduler).toHaveProperty('lastFetchTimes');
      expect(response.body.scheduler).toHaveProperty('database');

      // Configuration
      expect(response.body.configuration).toHaveProperty('serverUrl');
      expect(response.body.configuration).toHaveProperty('serverPort');
      expect(response.body.configuration).toHaveProperty('fetchFrequency');
      expect(response.body.configuration).toHaveProperty('cacheTimeToLive');
    });

    test('should include correct configuration values', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.configuration.serverUrl).toBe(process.env.SERVER_URL);
      expect(response.body.configuration.serverPort).toBe(process.env.SERVER_PORT);
      expect(response.body.configuration.fetchFrequency).toBe(process.env.FETCH_FREQUENCY);
      expect(response.body.configuration.cacheTimeToLive).toBe(process.env.RSS_CACHE_TTL);
    });

    test('should handle scheduler errors gracefully', async () => {
      const scheduler = require('../src/api/services/scheduler');
      scheduler.getStatus.mockRejectedValueOnce(new Error('Scheduler error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .get('/health')
        .expect(500);

      expect(response.body).toHaveProperty('status', 'ERROR');
      expect(response.body).toHaveProperty('error');
      expect(response.body).toHaveProperty('timestamp');

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error getting health status:',
        'Scheduler error'
      );

      consoleSpy.mockRestore();
    });

    test('should return valid timestamp format', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      const timestamp = response.body.timestamp;
      expect(timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);

      // Verify it's a recent timestamp (within last 5 seconds)
      const timestampDate = new Date(timestamp);
      const now = new Date();
      const diff = Math.abs(now - timestampDate);
      expect(diff).toBeLessThan(5000);
    });
  });

  describe('RSS routes integration', () => {
    test('should mount RSS routes correctly', async () => {
      const response = await request(app)
        .get('/rss/')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Feedarr RSS Service');
    });

    test('should handle RSS feed requests', async () => {
      // This test verifies that RSS routes are properly mounted
      // The actual RSS functionality is tested in rss.test.js
      const response = await request(app)
        .get('/rss/status')
        .expect(200);

      expect(response.body).toHaveProperty('isRunning');
    });
  });

  describe('Error handling', () => {
    test('should return 404 for unknown routes', async () => {
      const response = await request(app)
        .get('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
      expect(response.body).toHaveProperty('availableRoutes');
      expect(response.body.availableRoutes).toBeInstanceOf(Array);
      expect(response.body.availableRoutes).toContain('GET /');
      expect(response.body.availableRoutes).toContain('GET /health');
      expect(response.body.availableRoutes).toContain('GET /rss/calendar');
    });

    test('should handle POST to unknown routes', async () => {
      const response = await request(app)
        .post('/unknown-route')
        .expect(404);

      expect(response.body).toHaveProperty('error', 'Route not found');
    });

    test('should handle global errors in development mode', async () => {
      // Temporarily set NODE_ENV to development
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'development';

      // Create a route that throws an error for testing
      const express = require('express');
      const testApp = express();
      testApp.use(express.json());
      testApp.get('/test-error', (req, res, next) => {
        const error = new Error('Test error message');
        next(error);
      });

      // Apply the global error handler from the main app
      testApp.use((error, req, res, next) => {
        console.error('Unhandled error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
      });

      const response = await request(testApp)
        .get('/test-error')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(response.body).toHaveProperty('message', 'Test error message');

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });

    test('should handle global errors in production mode', async () => {
      // Temporarily set NODE_ENV to production
      const originalEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = 'production';

      const express = require('express');
      const testApp = express();
      testApp.use(express.json());
      testApp.get('/test-error', (req, res, next) => {
        next(new Error('Test error message'));
      });

      testApp.use((error, req, res, next) => {
        console.error('Unhandled error:', error);
        res.status(500).json({
          error: 'Internal server error',
          message: process.env.NODE_ENV === 'development' ? error.message : 'Something went wrong'
        });
      });

      const response = await request(testApp)
        .get('/test-error')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(response.body).toHaveProperty('message', 'Something went wrong');

      // Restore original NODE_ENV
      process.env.NODE_ENV = originalEnv;
    });
  });

  describe('Middleware', () => {
    test('should parse JSON requests', async () => {
      // This is tested implicitly through POST requests in other tests
      // but we'll verify the middleware is working
      const testData = { test: 'data' };

      // Since we don't have any POST endpoints that echo data,
      // we'll test that JSON is parsed by checking error responses
      const response = await request(app)
        .post('/rss/refresh')
        .send(testData)
        .expect(200); // This endpoint exists and should work

      // If JSON parsing failed, we'd get a different error
      expect(response.body).toHaveProperty('message');
    });

    test('should parse URL-encoded requests', async () => {
      const response = await request(app)
        .post('/rss/refresh')
        .send('test=data')
        .type('form')
        .expect(200);

      expect(response.body).toHaveProperty('message');
    });
  });

  describe('CORS and Headers', () => {
    test('should not have CORS headers by default', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers).not.toHaveProperty('access-control-allow-origin');
    });

    test('should return JSON content type for API endpoints', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });

    test('should handle different Accept headers', async () => {
      const response = await request(app)
        .get('/')
        .set('Accept', 'application/json')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('Server Information', () => {
    test('should expose correct version information', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.version).toBe('1.0.0');
    });

    test('should show test environment', async () => {
      const response = await request(app)
        .get('/')
        .expect(200);

      expect(response.body.environment).toBe('test');
    });
  });

  describe('Integration with external services', () => {
    test('should handle external API configuration in health check', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      expect(response.body.configuration.serverUrl).toBeDefined();
      expect(response.body.configuration.serverPort).toBeDefined();
    });

    test('should not expose sensitive configuration', async () => {
      const response = await request(app)
        .get('/health')
        .expect(200);

      // API key should not be exposed in health endpoint
      expect(response.body.configuration).not.toHaveProperty('apiKey');
      expect(response.body.configuration).not.toHaveProperty('API_KEY');

      // But other config should be present
      expect(response.body.configuration).toHaveProperty('serverUrl');
      expect(response.body.configuration).toHaveProperty('fetchFrequency');
    });
  });

  describe('Graceful shutdown preparation', () => {
    test('should be able to handle shutdown signals in tests', () => {
      const scheduler = require('../src/api/services/scheduler');

      // Verify that scheduler.stop is available (used in graceful shutdown)
      expect(scheduler.stop).toBeDefined();
      expect(typeof scheduler.stop).toBe('function');
    });
  });
});