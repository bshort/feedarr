const nock = require('nock');
const apiClient = require('../../src/api/services/apiClient');

describe('API Client', () => {
  const baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;

  beforeEach(() => {
    nock.cleanAll();
  });

  afterEach(() => {
    nock.cleanAll();
  });

  describe('constructor', () => {
    test('should create client with correct configuration', () => {
      expect(apiClient.baseURL).toBe(baseURL);
      expect(apiClient.apiKey).toBe(process.env.API_KEY);
      expect(apiClient.client.defaults.baseURL).toBe(baseURL);
      expect(apiClient.client.defaults.headers['X-Api-Key']).toBe(process.env.API_KEY);
      expect(apiClient.client.defaults.headers['Content-Type']).toBe('application/json');
      expect(apiClient.client.defaults.timeout).toBe(30000);
    });
  });

  describe('getCalendar', () => {
    const mockCalendarData = [
      {
        id: 1,
        title: 'Test Movie 1',
        year: 2023,
        inCinemas: '2023-12-01T00:00:00Z',
        digitalRelease: '2024-01-01T00:00:00Z',
        status: 'announced',
        overview: 'A test movie'
      },
      {
        id: 2,
        title: 'Test Movie 2',
        year: 2024,
        inCinemas: '2024-01-15T00:00:00Z',
        status: 'inCinemas',
        overview: 'Another test movie'
      }
    ];

    test('should fetch calendar data successfully', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(200, mockCalendarData);

      const result = await apiClient.getCalendar();
      expect(result).toEqual(mockCalendarData);
    });

    test('should fetch calendar data with parameters', async () => {
      const params = {
        end: '2024-01-31',
        unmonitored: false
      };

      nock(baseURL)
        .get('/calendar')
        .query(params)
        .reply(200, mockCalendarData);

      const result = await apiClient.getCalendar(params);
      expect(result).toEqual(mockCalendarData);
    });

    test('should handle calendar API errors', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(500, { error: 'Internal Server Error' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });

    test('should handle calendar API timeout', async () => {
      nock(baseURL)
        .get('/calendar')
        .delayConnection(35000) // Exceed 30s timeout
        .reply(200, mockCalendarData);

      await expect(apiClient.getCalendar()).rejects.toThrow('timeout');
    });

    test('should handle 404 responses', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(404, { error: 'Not Found' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });
  });

  describe('getNotifications', () => {
    const mockNotificationData = [
      {
        id: 1,
        name: 'Discord',
        implementationName: 'Discord',
        configContract: 'DiscordSettings',
        fields: [
          { name: 'webhook', value: 'https://discord.com/api/webhooks/test' }
        ]
      },
      {
        id: 2,
        name: 'Email',
        implementationName: 'Email',
        configContract: 'EmailSettings',
        fields: [
          { name: 'server', value: 'smtp.gmail.com' },
          { name: 'port', value: '587' }
        ]
      }
    ];

    test('should fetch notification data successfully', async () => {
      nock(baseURL)
        .get('/notification')
        .reply(200, mockNotificationData);

      const result = await apiClient.getNotifications();
      expect(result).toEqual(mockNotificationData);
    });

    test('should handle notification API errors', async () => {
      nock(baseURL)
        .get('/notification')
        .reply(401, { error: 'Unauthorized' });

      await expect(apiClient.getNotifications()).rejects.toThrow();
    });

    test('should handle empty notification response', async () => {
      nock(baseURL)
        .get('/notification')
        .reply(200, []);

      const result = await apiClient.getNotifications();
      expect(result).toEqual([]);
    });
  });

  describe('getQueue', () => {
    const mockQueueData = {
      records: [
        {
          id: 1,
          movieId: 123,
          movie: {
            id: 123,
            title: 'Test Movie',
            year: 2023,
            overview: 'A test movie in queue'
          },
          status: 'downloading',
          size: 1073741824, // 1GB
          sizeleft: 536870912, // 512MB
          quality: {
            quality: {
              name: '1080p'
            }
          },
          protocol: 'torrent',
          indexer: 'Test Indexer',
          added: '2023-12-01T10:00:00Z'
        }
      ],
      page: 1,
      pageSize: 50,
      totalRecords: 1
    };

    test('should fetch queue data successfully', async () => {
      nock(baseURL)
        .get('/queue')
        .reply(200, mockQueueData);

      const result = await apiClient.getQueue();
      expect(result).toEqual(mockQueueData);
    });

    test('should fetch queue data with parameters', async () => {
      const params = {
        pageSize: 25,
        includeUnknownMovieItems: true
      };

      nock(baseURL)
        .get('/queue')
        .query(params)
        .reply(200, mockQueueData);

      const result = await apiClient.getQueue(params);
      expect(result).toEqual(mockQueueData);
    });

    test('should handle queue API errors', async () => {
      nock(baseURL)
        .get('/queue')
        .reply(503, { error: 'Service Unavailable' });

      await expect(apiClient.getQueue()).rejects.toThrow();
    });

    test('should handle direct array response (non-paginated)', async () => {
      const directArrayData = mockQueueData.records;

      nock(baseURL)
        .get('/queue')
        .reply(200, directArrayData);

      const result = await apiClient.getQueue();
      expect(result).toEqual(directArrayData);
    });
  });

  describe('authentication', () => {
    test('should include API key in headers', async () => {
      const scope = nock(baseURL, {
        reqheaders: {
          'X-Api-Key': process.env.API_KEY
        }
      })
        .get('/calendar')
        .reply(200, []);

      await apiClient.getCalendar();
      expect(scope.isDone()).toBe(true);
    });

    test('should handle authentication errors', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(401, { error: 'Invalid API Key' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });
  });

  describe('error handling', () => {
    test('should log API errors with details', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      nock(baseURL)
        .get('/calendar')
        .reply(400, { error: 'Bad Request', message: 'Invalid parameters' });

      try {
        await apiClient.getCalendar();
      } catch (error) {
        // Expected to throw
      }

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('API Error: 400 -')
      );
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('URL: /calendar')
      );

      consoleSpy.mockRestore();
    });

    test('should handle network errors', async () => {
      nock(baseURL)
        .get('/calendar')
        .replyWithError('Network Error');

      await expect(apiClient.getCalendar()).rejects.toThrow('Network Error');
    });

    test('should handle malformed JSON responses', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(200, 'invalid json', { 'content-type': 'application/json' });

      // Axios will return the string as-is, not throw an error for 200 status
      const result = await apiClient.getCalendar();
      expect(result).toBe('invalid json');
    });
  });

  describe('integration scenarios', () => {
    test('should handle server maintenance mode', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(503, { error: 'Service Temporarily Unavailable' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });

    test('should handle rate limiting', async () => {
      nock(baseURL)
        .get('/calendar')
        .reply(429, { error: 'Too Many Requests' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });

    test('should handle SSL/TLS errors', async () => {
      nock(baseURL)
        .get('/calendar')
        .replyWithError({ code: 'CERT_UNTRUSTED' });

      await expect(apiClient.getCalendar()).rejects.toThrow();
    });
  });
});