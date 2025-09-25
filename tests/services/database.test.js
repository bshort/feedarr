const database = require('../../src/config/database');

describe('Database Service', () => {
  beforeEach(async () => {
    await database.initialize();
  });

  afterEach(async () => {
    await database.close();
  });

  describe('initialization', () => {
    test('should initialize database successfully', async () => {
      expect(database.isInitialized).toBe(true);
      const db = await database.getDatabase();
      expect(db).toBeDefined();
    });

    test('should create required tables', async () => {
      const db = await database.getDatabase();
      const tables = await db.raw("SELECT name FROM sqlite_master WHERE type='table'");
      const tableNames = tables.map(table => table.name);

      expect(tableNames).toContain('feed_cache');
      expect(tableNames).toContain('feed_metadata');
      expect(tableNames).toContain('knex_migrations');
    });
  });

  describe('feed cache operations', () => {
    const testFeedType = 'calendar';
    const testData = [
      { id: 1, title: 'Test Movie 1', year: 2023 },
      { id: 2, title: 'Test Movie 2', year: 2024 }
    ];

    test('should cache and retrieve feed data', async () => {
      await database.setCachedFeedData(testFeedType, testData);
      const cached = await database.getCachedFeedData(testFeedType);

      expect(cached).toEqual(testData);
    });

    test('should return null for non-existent cache', async () => {
      const cached = await database.getCachedFeedData('nonexistent');
      expect(cached).toBeNull();
    });

    test('should update existing cache', async () => {
      await database.setCachedFeedData(testFeedType, testData);

      const updatedData = [{ id: 3, title: 'Updated Movie', year: 2025 }];
      await database.setCachedFeedData(testFeedType, updatedData);

      const cached = await database.getCachedFeedData(testFeedType);
      expect(cached).toEqual(updatedData);
    });

    test('should clear specific feed cache', async () => {
      await database.setCachedFeedData('calendar', testData);
      await database.setCachedFeedData('queue', testData);

      await database.clearCachedFeedData('calendar');

      const calendarCache = await database.getCachedFeedData('calendar');
      const queueCache = await database.getCachedFeedData('queue');

      expect(calendarCache).toBeNull();
      expect(queueCache).toEqual(testData);
    });

    test('should clear all caches', async () => {
      await database.setCachedFeedData('calendar', testData);
      await database.setCachedFeedData('queue', testData);

      await database.clearCachedFeedData();

      const calendarCache = await database.getCachedFeedData('calendar');
      const queueCache = await database.getCachedFeedData('queue');

      expect(calendarCache).toBeNull();
      expect(queueCache).toBeNull();
    });

    test('should respect cache TTL', async () => {
      // Set a very short TTL for testing
      const originalTTL = process.env.RSS_CACHE_TTL;
      process.env.RSS_CACHE_TTL = '1'; // 1ms

      await database.setCachedFeedData(testFeedType, testData);

      // Wait for cache to expire
      await new Promise(resolve => setTimeout(resolve, 10));

      const cached = await database.getCachedFeedData(testFeedType);
      expect(cached).toBeNull();

      // Restore original TTL
      process.env.RSS_CACHE_TTL = originalTTL;
    });
  });

  describe('feed metadata operations', () => {
    const testFeedType = 'notification';
    const testMetadata = {
      lastFetch: new Date().toISOString(),
      itemCount: 5,
      status: 'success',
      errorMessage: null
    };

    test('should store and retrieve feed metadata', async () => {
      await database.setFeedMetadata(testFeedType, testMetadata);
      const metadata = await database.getFeedMetadata(testFeedType);

      expect(metadata.feed_type).toBe(testFeedType);
      expect(metadata.item_count).toBe(testMetadata.itemCount);
      expect(metadata.status).toBe(testMetadata.status);
    });

    test('should update existing metadata', async () => {
      await database.setFeedMetadata(testFeedType, testMetadata);

      const updatedMetadata = {
        ...testMetadata,
        itemCount: 10,
        status: 'error',
        errorMessage: 'Test error'
      };

      await database.setFeedMetadata(testFeedType, updatedMetadata);
      const metadata = await database.getFeedMetadata(testFeedType);

      expect(metadata.item_count).toBe(10);
      expect(metadata.status).toBe('error');
      expect(metadata.error_message).toBe('Test error');
    });

    test('should retrieve all feed metadata', async () => {
      await database.setFeedMetadata('calendar', testMetadata);
      await database.setFeedMetadata('queue', testMetadata);

      const allMetadata = await database.getAllFeedMetadata();
      expect(allMetadata).toHaveLength(2);

      const feedTypes = allMetadata.map(m => m.feed_type);
      expect(feedTypes).toContain('calendar');
      expect(feedTypes).toContain('queue');
    });

    test('should return null for non-existent metadata', async () => {
      const metadata = await database.getFeedMetadata('nonexistent');
      expect(metadata).toBeUndefined();
    });
  });

  describe('statistics', () => {
    test('should return statistics for feeds and cache', async () => {
      const testData = [{ id: 1, title: 'Test' }];
      const testMetadata = {
        lastFetch: new Date().toISOString(),
        itemCount: 1,
        status: 'success'
      };

      await database.setCachedFeedData('calendar', testData);
      await database.setFeedMetadata('calendar', testMetadata);

      const stats = await database.getStatistics();

      expect(stats).toHaveProperty('feeds');
      expect(stats).toHaveProperty('cache');
      expect(stats).toHaveProperty('totalCacheEntries');

      expect(stats.feeds).toHaveLength(1);
      expect(stats.cache).toHaveLength(1);
      expect(stats.totalCacheEntries).toBe(1);
    });

    test('should return empty statistics when no data', async () => {
      const stats = await database.getStatistics();

      expect(stats.feeds).toHaveLength(0);
      expect(stats.cache).toHaveLength(0);
      expect(stats.totalCacheEntries).toBe(0);
    });
  });
});