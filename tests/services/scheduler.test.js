const nock = require('nock');
const scheduler = require('../../src/api/services/scheduler');
const database = require('../../src/config/database');

// Mock the cron module
jest.mock('node-cron', () => ({
  schedule: jest.fn(() => ({
    start: jest.fn(),
    stop: jest.fn()
  }))
}));

describe('Scheduler Service', () => {
  const baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;

  beforeEach(async () => {
    await database.initialize();
    nock.cleanAll();
    jest.clearAllMocks();

    // Stop any running jobs
    scheduler.stop();
  });

  afterEach(async () => {
    scheduler.stop();
    nock.cleanAll();
    await database.close();
  });

  describe('initialization', () => {
    test('should initialize with correct frequency', () => {
      expect(scheduler.fetchFrequency).toBe(parseInt(process.env.FETCH_FREQUENCY));
    });

    test('should have empty jobs map initially', () => {
      expect(scheduler.jobs.size).toBe(0);
    });
  });

  describe('scheduler control', () => {
    test('should start scheduler successfully', () => {
      const cron = require('node-cron');

      scheduler.start();

      expect(cron.schedule).toHaveBeenCalled();
      expect(scheduler.jobs.size).toBe(1);
      expect(scheduler.jobs.has('rss-fetcher')).toBe(true);
    });

    test('should stop scheduler successfully', () => {
      scheduler.start();
      const stopSpy = jest.fn();
      scheduler.jobs.set('test-job', { stop: stopSpy });

      scheduler.stop();

      expect(stopSpy).toHaveBeenCalled();
      expect(scheduler.jobs.size).toBe(0);
    });
  });

  describe('calendar feed update', () => {
    const mockCalendarData = [
      {
        id: 1,
        title: 'Test Movie 1',
        year: 2023,
        inCinemas: '2023-12-01T00:00:00Z',
        overview: 'A test movie'
      }
    ];

    test('should update calendar feed successfully from API', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .reply(200, mockCalendarData);

      await scheduler.updateCalendarFeed();

      // Check if data was cached
      const cachedData = await database.getCachedFeedData('calendar');
      expect(cachedData).toEqual(mockCalendarData);

      // Check metadata
      const metadata = await database.getFeedMetadata('calendar');
      expect(metadata.status).toBe('success');
      expect(metadata.item_count).toBe(1);
    });

    test('should use cached data when available', async () => {
      // Pre-cache data
      await database.setCachedFeedData('calendar', mockCalendarData);

      // No API call should be made
      const scope = nock(baseURL)
        .get('/calendar')
        .reply(200, []);

      await scheduler.updateCalendarFeed();

      // Verify no API call was made
      expect(scope.isDone()).toBe(false);
      nock.cleanAll();
    });

    test('should handle calendar API errors gracefully', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .reply(500, { error: 'Internal Server Error' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await scheduler.updateCalendarFeed();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating calendar feed:',
        expect.any(String)
      );

      // Check error metadata
      const metadata = await database.getFeedMetadata('calendar');
      expect(metadata.status).toBe('error');
      expect(metadata.error_message).toBeDefined();

      consoleSpy.mockRestore();
    });
  });

  describe('notification feed update', () => {
    const mockNotificationData = [
      {
        id: 1,
        name: 'Discord',
        implementationName: 'Discord'
      }
    ];

    test('should update notification feed successfully', async () => {
      nock(baseURL)
        .get('/notification')
        .reply(200, mockNotificationData);

      await scheduler.updateNotificationFeed();

      const cachedData = await database.getCachedFeedData('notification');
      expect(cachedData).toEqual(mockNotificationData);

      const metadata = await database.getFeedMetadata('notification');
      expect(metadata.status).toBe('success');
      expect(metadata.item_count).toBe(1);
    });

    test('should handle notification API errors', async () => {
      nock(baseURL)
        .get('/notification')
        .reply(401, { error: 'Unauthorized' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await scheduler.updateNotificationFeed();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating notification feed:',
        expect.any(String)
      );

      const metadata = await database.getFeedMetadata('notification');
      expect(metadata.status).toBe('error');

      consoleSpy.mockRestore();
    });
  });

  describe('queue feed update', () => {
    const mockQueueData = {
      records: [
        {
          id: 1,
          status: 'downloading',
          movie: { id: 123, title: 'Test Movie' }
        }
      ]
    };

    test('should update queue feed successfully', async () => {
      nock(baseURL)
        .get('/queue')
        .query(true)
        .reply(200, mockQueueData);

      await scheduler.updateQueueFeed();

      const cachedData = await database.getCachedFeedData('queue');
      expect(cachedData).toEqual(mockQueueData);

      const metadata = await database.getFeedMetadata('queue');
      expect(metadata.status).toBe('success');
      expect(metadata.item_count).toBe(1);
    });

    test('should handle direct array response', async () => {
      const directArray = mockQueueData.records;

      nock(baseURL)
        .get('/queue')
        .query(true)
        .reply(200, directArray);

      await scheduler.updateQueueFeed();

      const metadata = await database.getFeedMetadata('queue');
      expect(metadata.item_count).toBe(1);
    });

    test('should handle queue API errors', async () => {
      nock(baseURL)
        .get('/queue')
        .query(true)
        .reply(503, { error: 'Service Unavailable' });

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await scheduler.updateQueueFeed();

      expect(consoleSpy).toHaveBeenCalledWith(
        'Error updating queue feed:',
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('manual updates', () => {
    test('should perform manual update for specific feed type', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .reply(200, []);

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await scheduler.manualUpdate('calendar');

      expect(consoleSpy).toHaveBeenCalledWith('Manual update requested for: calendar');

      consoleSpy.mockRestore();
    });

    test('should perform manual update for all feeds', async () => {
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await scheduler.manualUpdate();

      expect(consoleSpy).toHaveBeenCalledWith('Manual update requested for all feeds');

      consoleSpy.mockRestore();
    });

    test('should throw error for invalid feed type', async () => {
      await expect(scheduler.manualUpdate('invalid')).rejects.toThrow('Unknown feed type: invalid');
    });
  });

  describe('status reporting', () => {
    test('should return correct status when not running', async () => {
      const status = await scheduler.getStatus();

      expect(status.isRunning).toBe(false);
      expect(status.fetchFrequency).toBe(parseInt(process.env.FETCH_FREQUENCY));
      expect(status.lastFetchTimes).toEqual({});
      expect(status.activeJobs).toEqual([]);
      expect(status.database).toBeDefined();
    });

    test('should return correct status when running', async () => {
      scheduler.start();
      scheduler.lastFetchTimes.set('calendar', new Date());

      const status = await scheduler.getStatus();

      expect(status.isRunning).toBe(true);
      expect(status.activeJobs).toContain('rss-fetcher');
      expect(Object.keys(status.lastFetchTimes)).toContain('calendar');
    });

    test('should handle database errors in status', async () => {
      // Close database to simulate error
      await database.close();

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const status = await scheduler.getStatus();

      expect(status.database).toHaveProperty('error');
      expect(consoleSpy).toHaveBeenCalledWith(
        'Error getting database statistics:',
        expect.any(String)
      );

      consoleSpy.mockRestore();

      // Reinitialize for cleanup
      await database.initialize();
    });
  });

  describe('fetch all feeds', () => {
    test('should fetch all feeds successfully', async () => {
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

      const consoleSpy = jest.spyOn(console, 'log').mockImplementation();

      await scheduler.fetchAllFeeds();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Starting RSS feed update cycle/)
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/RSS feed update cycle completed in \d+ms/)
      );

      consoleSpy.mockRestore();
    });

    test('should handle errors during fetch all feeds', async () => {
      nock(baseURL)
        .get('/calendar')
        .query(true)
        .replyWithError('Network Error');

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await scheduler.fetchAllFeeds();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringMatching(/Error during RSS feed update cycle:/),
        expect.any(String)
      );

      consoleSpy.mockRestore();
    });
  });

  describe('cron configuration', () => {
    test('should configure cron with correct frequency', () => {
      const cron = require('node-cron');

      scheduler.start();

      const cronCall = cron.schedule.mock.calls[0];
      const cronPattern = cronCall[0];

      // Verify it's a valid cron pattern for minutes
      expect(cronPattern).toMatch(/^\*\/\d+ \* \* \* \*$/);
    });

    test('should handle minimum frequency of 1 minute', () => {
      const originalFreq = process.env.FETCH_FREQUENCY;
      process.env.FETCH_FREQUENCY = '30000'; // 30 seconds

      scheduler.fetchFrequency = 30000;

      const cron = require('node-cron');

      scheduler.start();

      const cronCall = cron.schedule.mock.calls[0];
      const cronPattern = cronCall[0];

      expect(cronPattern).toBe('*/1 * * * *'); // Should be minimum 1 minute

      process.env.FETCH_FREQUENCY = originalFreq;
    });
  });
});