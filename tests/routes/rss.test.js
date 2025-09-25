const request = require('supertest');
const express = require('express');
const nock = require('nock');
const rssRoutes = require('../../src/api/routes/rss');
const database = require('../../src/config/database');

// Create test app
const createApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/rss', rssRoutes);
  return app;
};

describe('RSS Routes', () => {
  let app;
  const baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;

  beforeEach(async () => {
    app = createApp();
    await database.initialize();
    nock.cleanAll();
  });

  afterEach(async () => {
    nock.cleanAll();
    await database.close();
  });

  describe('GET /rss/', () => {
    test('should return feed discovery information', async () => {
      const response = await request(app)
        .get('/rss/')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'Feedarr RSS Service');
      expect(response.body).toHaveProperty('availableFeeds');
      expect(response.body.availableFeeds).toHaveProperty('calendar');
      expect(response.body.availableFeeds).toHaveProperty('notification');
      expect(response.body.availableFeeds).toHaveProperty('queue');
      expect(response.body).toHaveProperty('endpoints');
    });
  });

  describe('GET /rss/status', () => {
    test('should return scheduler status', async () => {
      const response = await request(app)
        .get('/rss/status')
        .expect(200);

      expect(response.body).toHaveProperty('isRunning');
      expect(response.body).toHaveProperty('fetchFrequency');
      expect(response.body).toHaveProperty('lastFetchTimes');
      expect(response.body).toHaveProperty('availableFeeds');
      expect(response.body).toHaveProperty('feedUrls');
      expect(response.body).toHaveProperty('database');

      expect(response.body.availableFeeds).toEqual(['calendar', 'notification', 'queue']);
    });
  });

  describe('RSS Feed Endpoints', () => {
    const mockCalendarData = [
      {
        id: 1,
        title: 'Test Movie',
        year: 2023,
        overview: 'A test movie',
        inCinemas: '2023-12-01T00:00:00Z'
      }
    ];

    const mockNotificationData = [
      {
        id: 1,
        name: 'Discord',
        implementationName: 'Discord'
      }
    ];

    const mockQueueData = [
      {
        id: 1,
        status: 'downloading',
        movie: { id: 123, title: 'Test Movie' }
      }
    ];

    beforeEach(async () => {
      // Pre-generate feeds
      const rssGenerator = require('../../src/api/services/rssGenerator');
      const path = require('path');
      const fs = require('fs-extra');

      rssGenerator.feedsDir = path.join(__dirname, '../test-feeds');
      await fs.ensureDir(rssGenerator.feedsDir);

      await rssGenerator.generateCalendarFeed(mockCalendarData);
      await rssGenerator.generateNotificationFeed(mockNotificationData);
      await rssGenerator.generateQueueFeed(mockQueueData);
    });

    describe('GET /rss/calendar', () => {
      test('should return calendar RSS feed', async () => {
        const response = await request(app)
          .get('/rss/calendar')
          .expect(200);

        expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
        expect(response.text).toContain('version="2.0"');
        expect(response.text).toContain('<![CDATA[Calendar Feed]]>');
        expect(response.text).toContain('Test Movie');
      });

      test('should return 404 if feed not found', async () => {
        // Clear the feed
        const rssGenerator = require('../../src/api/services/rssGenerator');
        const fs = require('fs-extra');
        const path = require('path');

        const feedPath = path.join(rssGenerator.feedsDir, 'calendar.xml');
        await fs.remove(feedPath);

        const response = await request(app)
          .get('/rss/calendar')
          .expect(404);

        expect(response.body).toHaveProperty('error', 'Calendar RSS feed not found');
      });

      test('should set correct cache headers', async () => {
        const response = await request(app)
          .get('/rss/calendar')
          .expect(200);

        expect(response.headers).toHaveProperty('cache-control');
        expect(response.headers['cache-control']).toContain('public');
      });
    });

    describe('GET /rss/notification', () => {
      test('should return notification RSS feed', async () => {
        const response = await request(app)
          .get('/rss/notification')
          .expect(200);

        expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
        expect(response.text).toContain('<![CDATA[Notifications Feed]]>');
        expect(response.text).toContain('Discord');
      });

      test('should return 404 if feed not found', async () => {
        const rssGenerator = require('../../src/api/services/rssGenerator');
        const fs = require('fs-extra');
        const path = require('path');

        const feedPath = path.join(rssGenerator.feedsDir, 'notification.xml');
        await fs.remove(feedPath);

        const response = await request(app)
          .get('/rss/notification')
          .expect(404);

        expect(response.body).toHaveProperty('error', 'Notification RSS feed not found');
      });
    });

    describe('GET /rss/queue', () => {
      test('should return queue RSS feed', async () => {
        const response = await request(app)
          .get('/rss/queue')
          .expect(200);

        expect(response.headers['content-type']).toMatch(/application\/rss\+xml/);
        expect(response.text).toContain('<![CDATA[Queue Feed]]>');
        expect(response.text).toContain('downloading');
      });

      test('should return 404 if feed not found', async () => {
        const rssGenerator = require('../../src/api/services/rssGenerator');
        const fs = require('fs-extra');
        const path = require('path');

        const feedPath = path.join(rssGenerator.feedsDir, 'queue.xml');
        await fs.remove(feedPath);

        const response = await request(app)
          .get('/rss/queue')
          .expect(404);

        expect(response.body).toHaveProperty('error', 'Queue RSS feed not found');
      });
    });
  });

  describe('POST /rss/refresh', () => {
    test('should refresh all feeds', async () => {
      // Mock all API endpoints
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .reply(200, []);

      nock(baseURL)
        .get('/notification')
        .reply(200, []);

      nock(baseURL)
        .get('/queue')
        .query(true)
        .reply(200, []);

      const response = await request(app)
        .post('/rss/refresh')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'All feeds refreshed successfully');
      expect(response.body).toHaveProperty('timestamp');
    });

    test('should refresh specific feed', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .reply(200, []);

      const response = await request(app)
        .post('/rss/refresh/calendar')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'calendar feed refreshed successfully');
    });

    test('should return 400 for invalid feed type', async () => {
      const response = await request(app)
        .post('/rss/refresh/invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid feed type');
      expect(response.body.message).toContain('calendar, notification, queue');
    });

    test('should handle refresh errors', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .replyWithError('Network Error');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .post('/rss/refresh/calendar')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('DELETE /rss/cache', () => {
    beforeEach(async () => {
      // Pre-cache some data
      await database.setCachedFeedData('calendar', [{ id: 1, title: 'Test' }]);
      await database.setCachedFeedData('queue', [{ id: 2, status: 'downloading' }]);
    });

    test('should clear all caches', async () => {
      const response = await request(app)
        .delete('/rss/cache')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'All caches cleared successfully');

      // Verify caches are cleared
      const calendarCache = await database.getCachedFeedData('calendar');
      const queueCache = await database.getCachedFeedData('queue');

      expect(calendarCache).toBeNull();
      expect(queueCache).toBeNull();
    });

    test('should clear specific feed cache', async () => {
      const response = await request(app)
        .delete('/rss/cache/calendar')
        .expect(200);

      expect(response.body).toHaveProperty('message', 'calendar cache cleared successfully');

      // Verify only calendar cache is cleared
      const calendarCache = await database.getCachedFeedData('calendar');
      const queueCache = await database.getCachedFeedData('queue');

      expect(calendarCache).toBeNull();
      expect(queueCache).not.toBeNull();
    });

    test('should return 400 for invalid feed type', async () => {
      const response = await request(app)
        .delete('/rss/cache/invalid')
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Invalid feed type');
    });

    test('should handle cache clearing errors', async () => {
      // Close database to simulate error
      await database.close();

      const response = await request(app)
        .delete('/rss/cache')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Reinitialize for cleanup
      await database.initialize();
    });
  });

  describe('Error handling', () => {
    test('should handle RSS generator errors gracefully', async () => {
      // Mock RSS generator to throw error
      const rssGenerator = require('../../src/api/services/rssGenerator');
      const originalReadFeed = rssGenerator.readFeed;
      rssGenerator.readFeed = jest.fn().mockRejectedValue(new Error('File system error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .get('/rss/calendar')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');
      expect(consoleSpy).toHaveBeenCalled();

      // Restore original method
      rssGenerator.readFeed = originalReadFeed;
      consoleSpy.mockRestore();
    });

    test('should handle scheduler status errors', async () => {
      // Mock scheduler to throw error
      const scheduler = require('../../src/api/services/scheduler');
      const originalGetStatus = scheduler.getStatus;
      scheduler.getStatus = jest.fn().mockRejectedValue(new Error('Scheduler error'));

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const response = await request(app)
        .get('/rss/status')
        .expect(500);

      expect(response.body).toHaveProperty('error', 'Internal server error');

      // Restore original method
      scheduler.getStatus = originalGetStatus;
      consoleSpy.mockRestore();
    });
  });

  describe('Content Type and Headers', () => {
    beforeEach(async () => {
      // Ensure feed exists
      const rssGenerator = require('../../src/api/services/rssGenerator');
      const path = require('path');
      const fs = require('fs-extra');

      rssGenerator.feedsDir = path.join(__dirname, '../test-feeds');
      await fs.ensureDir(rssGenerator.feedsDir);
      await rssGenerator.generateCalendarFeed([{ id: 1, title: 'Test' }]);
    });

    test('should set correct content type for RSS feeds', async () => {
      const response = await request(app)
        .get('/rss/calendar')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/rss\+xml.*charset=utf-8/);
    });

    test('should set cache control headers', async () => {
      const response = await request(app)
        .get('/rss/calendar')
        .expect(200);

      expect(response.headers['cache-control']).toContain('public');
      expect(response.headers['cache-control']).toContain('max-age=');
    });

    test('should return JSON for status endpoints', async () => {
      const response = await request(app)
        .get('/rss/status')
        .expect(200);

      expect(response.headers['content-type']).toMatch(/application\/json/);
    });
  });

  describe('URL Generation', () => {
    test('should generate correct feed URLs in discovery', async () => {
      const response = await request(app)
        .get('/rss/')
        .set('Host', 'example.com')
        .expect(200);

      expect(response.body.availableFeeds.calendar.url).toContain('example.com');
      expect(response.body.availableFeeds.calendar.url).toContain('/rss/calendar');
      expect(response.body.endpoints.status).toContain('example.com');
    });

    test('should generate correct feed URLs in status', async () => {
      const response = await request(app)
        .get('/rss/status')
        .set('Host', 'localhost:3000')
        .expect(200);

      expect(response.body.feedUrls.calendar).toContain('localhost:3000');
      expect(response.body.feedUrls.notification).toContain('/rss/notification');
      expect(response.body.feedUrls.queue).toContain('/rss/queue');
    });
  });
});