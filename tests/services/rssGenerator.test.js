const fs = require('fs-extra');
const path = require('path');
const rssGenerator = require('../../src/api/services/rssGenerator');

describe('RSS Generator', () => {
  const testFeedsDir = path.join(__dirname, '../test-feeds');

  beforeEach(async () => {
    // Override feeds directory for testing
    rssGenerator.feedsDir = testFeedsDir;
    await fs.ensureDir(testFeedsDir);
  });

  afterEach(async () => {
    await fs.remove(testFeedsDir);
  });

  describe('feed directory management', () => {
    test('should ensure feeds directory exists', async () => {
      await rssGenerator.ensureFeedsDirectory();
      const exists = await fs.pathExists(testFeedsDir);
      expect(exists).toBe(true);
    });
  });

  describe('base feed creation', () => {
    test('should create base RSS feed with correct metadata', () => {
      const feed = rssGenerator.createBaseFeed(
        'Test Feed',
        'Test Description',
        'http://localhost:3000/rss/test'
      );

      expect(feed).toBeDefined();
      expect(feed.title).toBe('Test Feed');
      expect(feed.description).toBe('Test Description');
    });
  });

  describe('calendar feed generation', () => {
    const mockCalendarData = [
      {
        id: 1,
        title: 'Test Movie 1',
        year: 2023,
        overview: 'A great test movie',
        status: 'announced',
        inCinemas: '2023-12-01T00:00:00Z',
        digitalRelease: '2024-01-01T00:00:00Z',
        physicalRelease: '2024-02-01T00:00:00Z',
        genres: ['Action', 'Adventure'],
        imdbId: 'tt1234567'
      },
      {
        id: 2,
        title: 'Test Movie 2',
        year: 2024,
        overview: 'Another test movie',
        status: 'inCinemas',
        inCinemas: '2024-01-15T00:00:00Z',
        genres: ['Comedy', 'Drama'],
        imdbId: 'tt2345678'
      }
    ];

    test('should generate calendar RSS feed with movie data', async () => {
      const xml = await rssGenerator.generateCalendarFeed(mockCalendarData);

      expect(xml).toBeDefined();
      expect(xml).toContain('version="2.0"');
      expect(xml).toContain('<![CDATA[Calendar Feed]]>');
      expect(xml).toContain('<![CDATA[Upcoming movies from calendar]]>');
      expect(xml).toContain('Test Movie 1');
      expect(xml).toContain('Test Movie 2');
      expect(xml).toContain('A great test movie');
      expect(xml).toContain('tt1234567');
    });

    test('should save calendar feed to file', async () => {
      await rssGenerator.generateCalendarFeed(mockCalendarData);

      const feedPath = path.join(testFeedsDir, 'calendar.xml');
      const exists = await fs.pathExists(feedPath);
      expect(exists).toBe(true);

      const content = await fs.readFile(feedPath, 'utf8');
      expect(content).toContain('Test Movie 1');
    });

    test('should handle empty calendar data', async () => {
      const xml = await rssGenerator.generateCalendarFeed([]);

      expect(xml).toBeDefined();
      expect(xml).toContain('version="2.0"');
      expect(xml).toContain('<![CDATA[Calendar Feed]]>');
    });

    test('should handle null calendar data', async () => {
      const xml = await rssGenerator.generateCalendarFeed(null);

      expect(xml).toBeDefined();
      expect(xml).toContain('version="2.0"');
    });

    test('should build movie descriptions correctly', () => {
      const movie = mockCalendarData[0];
      const description = rssGenerator.buildMovieDescription(movie);

      expect(description).toContain('<strong>Overview:</strong>');
      expect(description).toContain('A great test movie');
      expect(description).toContain('<strong>Year:</strong> 2023');
      expect(description).toContain('<strong>Status:</strong> announced');
      expect(description).toContain('<strong>In Cinemas:</strong>');
      expect(description).toContain('<strong>Digital Release:</strong>');
      expect(description).toContain('<strong>Physical Release:</strong>');
      expect(description).toContain('<strong>Genres:</strong> Action, Adventure');
    });
  });

  describe('notification feed generation', () => {
    const mockNotificationData = [
      {
        id: 1,
        name: 'Discord Notification',
        implementationName: 'Discord',
        configContract: 'DiscordSettings',
        fields: [
          { name: 'webhook', value: 'https://discord.com/api/webhooks/test' }
        ]
      },
      {
        id: 2,
        name: 'Email Notification',
        implementationName: 'Email',
        configContract: 'EmailSettings',
        fields: [
          { name: 'server', value: 'smtp.gmail.com' }
        ]
      }
    ];

    test('should generate notification RSS feed', async () => {
      const xml = await rssGenerator.generateNotificationFeed(mockNotificationData);

      expect(xml).toBeDefined();
      expect(xml).toContain('version="2.0"');
      expect(xml).toContain('<![CDATA[Notifications Feed]]>');
      expect(xml).toContain('Discord Notification');
      expect(xml).toContain('Email Notification');
    });

    test('should save notification feed to file', async () => {
      await rssGenerator.generateNotificationFeed(mockNotificationData);

      const feedPath = path.join(testFeedsDir, 'notification.xml');
      const exists = await fs.pathExists(feedPath);
      expect(exists).toBe(true);
    });

    test('should build notification descriptions correctly', () => {
      const notification = mockNotificationData[0];
      const description = rssGenerator.buildNotificationDescription(notification);

      expect(description).toContain('<strong>Implementation:</strong> Discord');
      expect(description).toContain('<strong>Configuration Fields:</strong> 1 fields configured');
      expect(description).toContain('<strong>Contract:</strong> DiscordSettings');
    });
  });

  describe('queue feed generation', () => {
    const mockQueueData = [
      {
        id: 1,
        status: 'downloading',
        size: 1073741824,
        sizeleft: 536870912,
        quality: {
          quality: {
            name: '1080p'
          }
        },
        protocol: 'torrent',
        indexer: 'Test Indexer',
        added: '2023-12-01T10:00:00Z',
        movie: {
          id: 123,
          title: 'Queue Movie 1',
          overview: 'A movie being downloaded',
          imdbId: 'tt3456789'
        }
      },
      {
        id: 2,
        status: 'completed',
        size: 2147483648,
        sizeleft: 0,
        quality: {
          quality: {
            name: '720p'
          }
        },
        protocol: 'usenet',
        indexer: 'Another Indexer',
        added: '2023-11-30T08:00:00Z',
        movie: {
          id: 124,
          title: 'Queue Movie 2',
          overview: 'A completed download',
          imdbId: 'tt4567890'
        }
      }
    ];

    test('should generate queue RSS feed', async () => {
      const xml = await rssGenerator.generateQueueFeed(mockQueueData);

      expect(xml).toBeDefined();
      expect(xml).toContain('version="2.0"');
      expect(xml).toContain('<![CDATA[Queue Feed]]>');
      expect(xml).toContain('Queue Movie 1 - downloading');
      expect(xml).toContain('Queue Movie 2 - completed');
    });

    test('should save queue feed to file', async () => {
      await rssGenerator.generateQueueFeed(mockQueueData);

      const feedPath = path.join(testFeedsDir, 'queue.xml');
      const exists = await fs.pathExists(feedPath);
      expect(exists).toBe(true);
    });

    test('should build queue descriptions correctly', () => {
      const item = mockQueueData[0];
      const description = rssGenerator.buildQueueDescription(item);

      expect(description).toContain('<strong>Status:</strong> downloading');
      expect(description).toContain('<strong>Progress:</strong> 50.0%');
      expect(description).toContain('<strong>Quality:</strong> 1080p');
      expect(description).toContain('<strong>Protocol:</strong> torrent');
      expect(description).toContain('<strong>Indexer:</strong> Test Indexer');
      expect(description).toContain('<strong>Movie Overview:</strong>');
    });

    test('should handle queue items without movie data', async () => {
      const itemsWithoutMovie = [
        {
          id: 1,
          status: 'downloading',
          movie: null
        }
      ];

      const xml = await rssGenerator.generateQueueFeed(itemsWithoutMovie);

      expect(xml).toBeDefined();
      expect(xml).toContain('Unknown Movie - downloading');
    });
  });

  describe('utility methods', () => {
    test('should escape HTML characters correctly', () => {
      const testString = '<script>alert("test")</script> & "quotes"';
      const escaped = rssGenerator.escapeHtml(testString);

      expect(escaped).toBe('&lt;script&gt;alert(&quot;test&quot;)&lt;/script&gt; &amp; &quot;quotes&quot;');
    });

    test('should handle null/undefined strings in escapeHtml', () => {
      expect(rssGenerator.escapeHtml(null)).toBe('');
      expect(rssGenerator.escapeHtml(undefined)).toBe('');
      expect(rssGenerator.escapeHtml('')).toBe('');
    });

    test('should get movie categories correctly', () => {
      const movie = {
        status: 'announced',
        genres: ['Action', 'Adventure', 'Sci-Fi', 'Thriller']
      };

      const categories = rssGenerator.getMovieCategories(movie);

      expect(categories).toContain('Movie');
      expect(categories).toContain('announced');
      expect(categories).toContain('Action');
      expect(categories).toContain('Adventure');
      expect(categories).toContain('Sci-Fi');
      expect(categories.length).toBeLessThanOrEqual(5); // Movie + status + max 3 genres
    });
  });

  describe('feed file operations', () => {
    test('should check if feed exists', async () => {
      const exists = await rssGenerator.feedExists('calendar');
      expect(exists).toBe(false);

      await rssGenerator.generateCalendarFeed([]);
      const existsAfter = await rssGenerator.feedExists('calendar');
      expect(existsAfter).toBe(true);
    });

    test('should read existing feed', async () => {
      await rssGenerator.generateCalendarFeed([{ id: 1, title: 'Test Movie' }]);
      const content = await rssGenerator.readFeed('calendar');

      expect(content).toBeDefined();
      expect(content).toContain('version="2.0"');
      expect(content).toContain('Test Movie');
    });

    test('should return null for non-existent feed', async () => {
      const content = await rssGenerator.readFeed('nonexistent');
      expect(content).toBeNull();
    });

    test('should get correct feed path', async () => {
      const feedPath = await rssGenerator.getFeedPath('calendar');
      expect(feedPath).toBe(path.join(testFeedsDir, 'calendar.xml'));
    });
  });

  describe('RSS XML validation', () => {
    test('should generate valid RSS XML structure', async () => {
      const mockData = [{
        id: 1,
        title: 'Test Movie',
        overview: 'Test description',
        year: 2023
      }];

      const xml = await rssGenerator.generateCalendarFeed(mockData);

      // Basic RSS structure validation
      expect(xml).toMatch(/<\?xml version="1\.0" encoding="UTF-8"\?>/);
      expect(xml).toMatch(/version="2\.0"/);
      expect(xml).toContain('<channel>');
      expect(xml).toContain('</channel>');
      expect(xml).toContain('<item>');
      expect(xml).toContain('</item>');
      expect(xml).toContain('<title>');
      expect(xml).toContain('<description>');
      expect(xml).toContain('<guid');
      expect(xml).toContain('<pubDate>');
      expect(xml).toContain('</rss>');
    });

    test('should properly escape XML content', async () => {
      const mockData = [{
        id: 1,
        title: 'Movie with <special> & "quoted" characters',
        overview: 'Description with <html> tags & ampersands'
      }];

      const xml = await rssGenerator.generateCalendarFeed(mockData);

      // RSS library uses CDATA which preserves the original content safely
      expect(xml).toContain('<![CDATA[Movie with <special> & "quoted" characters]]>');
      expect(xml).toContain('<![CDATA[');
      expect(xml).toContain(']]>');
    });
  });
});