const fs = require('fs-extra');
const path = require('path');

// Test environment setup
process.env.NODE_ENV = 'test';
process.env.PORT = '0'; // Use random port for tests
process.env.DATABASE_PATH = './test-data/test.db';
process.env.SERVER_URL = 'http://localhost';
process.env.SERVER_PORT = '7878';
process.env.API_KEY = 'test-api-key';
process.env.API_BASE_URL = '/api/v3';
process.env.FETCH_FREQUENCY = '60000';
process.env.RSS_CACHE_TTL = '30000';

// Suppress console logs during tests unless explicitly testing them
const originalConsoleLog = console.log;
const originalConsoleError = console.error;

beforeAll(() => {
  console.log = jest.fn();
  // Keep error logs for debugging but silence info logs
  console.error = originalConsoleError;
});

afterAll(() => {
  console.log = originalConsoleLog;
  console.error = originalConsoleError;
});

// Clean up test database before and after tests
beforeEach(async () => {
  const testDbDir = path.dirname(process.env.DATABASE_PATH);
  await fs.remove(testDbDir);
  await fs.ensureDir(testDbDir);
});

afterEach(async () => {
  const testDbDir = path.dirname(process.env.DATABASE_PATH);
  await fs.remove(testDbDir);
});

// Global test timeout
jest.setTimeout(10000);