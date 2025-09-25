const cron = require('node-cron');
const apiClient = require('./apiClient');
const rssGenerator = require('./rssGenerator');
const database = require('../../config/database');

class Scheduler {
  constructor() {
    this.jobs = new Map();
    this.lastFetchTimes = new Map();
    this.fetchFrequency = parseInt(process.env.FETCH_FREQUENCY) || 300000; // 5 minutes default
  }

  start() {
    console.log('Starting RSS feed scheduler...');
    console.log(`Fetch frequency: ${this.fetchFrequency}ms (${this.fetchFrequency / 1000 / 60} minutes)`);

    // Convert milliseconds to cron format - run every X minutes
    const minutes = Math.max(1, Math.floor(this.fetchFrequency / 1000 / 60));
    const cronPattern = `*/${minutes} * * * *`;

    console.log(`Cron pattern: ${cronPattern}`);

    const job = cron.schedule(cronPattern, async () => {
      await this.fetchAllFeeds();
    }, {
      scheduled: false
    });

    this.jobs.set('rss-fetcher', job);
    job.start();

    // Initial fetch
    this.fetchAllFeeds();

    console.log('RSS feed scheduler started successfully');
  }

  stop() {
    console.log('Stopping RSS feed scheduler...');
    this.jobs.forEach((job, name) => {
      job.stop();
      console.log(`Stopped job: ${name}`);
    });
    this.jobs.clear();
    console.log('RSS feed scheduler stopped');
  }

  async fetchAllFeeds() {
    const startTime = Date.now();
    console.log(`[${new Date().toISOString()}] Starting RSS feed update cycle`);

    try {
      await Promise.allSettled([
        this.updateCalendarFeed(),
        this.updateNotificationFeed(),
        this.updateQueueFeed()
      ]);

      const duration = Date.now() - startTime;
      console.log(`[${new Date().toISOString()}] RSS feed update cycle completed in ${duration}ms`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Error during RSS feed update cycle:`, error.message);
    }
  }

  async updateCalendarFeed() {
    try {
      console.log('Fetching calendar data...');

      // Check cache first
      const cachedData = await database.getCachedFeedData('calendar');
      let calendarData = cachedData;

      if (!cachedData) {
        // Get upcoming movies for the next 30 days
        const endDate = new Date();
        endDate.setDate(endDate.getDate() + 30);

        const params = {
          end: endDate.toISOString().split('T')[0],
          unmonitored: false
        };

        calendarData = await apiClient.getCalendar(params);
        console.log(`Retrieved ${calendarData?.length || 0} calendar items from API`);

        // Cache the data
        await database.setCachedFeedData('calendar', calendarData);
      } else {
        console.log(`Using cached calendar data (${cachedData?.length || 0} items)`);
      }

      await rssGenerator.generateCalendarFeed(calendarData);
      this.lastFetchTimes.set('calendar', new Date());

      // Update metadata
      await database.setFeedMetadata('calendar', {
        lastFetch: new Date().toISOString(),
        itemCount: calendarData?.length || 0,
        status: 'success'
      });

      console.log('Calendar RSS feed updated successfully');
    } catch (error) {
      console.error('Error updating calendar feed:', error.message);

      // Log error to database
      await database.setFeedMetadata('calendar', {
        lastFetch: new Date().toISOString(),
        itemCount: 0,
        status: 'error',
        errorMessage: error.message
      });
    }
  }

  async updateNotificationFeed() {
    try {
      console.log('Fetching notification data...');

      // Check cache first
      const cachedData = await database.getCachedFeedData('notification');
      let notificationData = cachedData;

      if (!cachedData) {
        notificationData = await apiClient.getNotifications();
        console.log(`Retrieved ${notificationData?.length || 0} notifications from API`);

        // Cache the data
        await database.setCachedFeedData('notification', notificationData);
      } else {
        console.log(`Using cached notification data (${cachedData?.length || 0} items)`);
      }

      await rssGenerator.generateNotificationFeed(notificationData);
      this.lastFetchTimes.set('notification', new Date());

      // Update metadata
      await database.setFeedMetadata('notification', {
        lastFetch: new Date().toISOString(),
        itemCount: notificationData?.length || 0,
        status: 'success'
      });

      console.log('Notification RSS feed updated successfully');
    } catch (error) {
      console.error('Error updating notification feed:', error.message);

      // Log error to database
      await database.setFeedMetadata('notification', {
        lastFetch: new Date().toISOString(),
        itemCount: 0,
        status: 'error',
        errorMessage: error.message
      });
    }
  }

  async updateQueueFeed() {
    try {
      console.log('Fetching queue data...');

      // Check cache first
      const cachedData = await database.getCachedFeedData('queue');
      let queueData = cachedData;

      if (!cachedData) {
        const params = {
          pageSize: 50,
          includeUnknownMovieItems: false
        };

        queueData = await apiClient.getQueue(params);
        console.log(`Retrieved ${queueData?.records?.length || queueData?.length || 0} queue items from API`);

        // Cache the data
        await database.setCachedFeedData('queue', queueData);
      } else {
        console.log(`Using cached queue data (${cachedData?.records?.length || cachedData?.length || 0} items)`);
      }

      // Handle both paginated and direct array responses
      const items = queueData?.records || queueData || [];
      await rssGenerator.generateQueueFeed(items);
      this.lastFetchTimes.set('queue', new Date());

      // Update metadata
      await database.setFeedMetadata('queue', {
        lastFetch: new Date().toISOString(),
        itemCount: items.length,
        status: 'success'
      });

      console.log('Queue RSS feed updated successfully');
    } catch (error) {
      console.error('Error updating queue feed:', error.message);

      // Log error to database
      await database.setFeedMetadata('queue', {
        lastFetch: new Date().toISOString(),
        itemCount: 0,
        status: 'error',
        errorMessage: error.message
      });
    }
  }

  async getStatus() {
    const status = {
      isRunning: this.jobs.size > 0,
      fetchFrequency: this.fetchFrequency,
      lastFetchTimes: Object.fromEntries(this.lastFetchTimes),
      activeJobs: Array.from(this.jobs.keys())
    };

    try {
      // Get database statistics
      const dbStats = await database.getStatistics();
      status.database = dbStats;
    } catch (error) {
      console.error('Error getting database statistics:', error.message);
      status.database = { error: error.message };
    }

    return status;
  }

  async manualUpdate(feedType = null) {
    if (feedType) {
      console.log(`Manual update requested for: ${feedType}`);
      switch (feedType) {
        case 'calendar':
          await this.updateCalendarFeed();
          break;
        case 'notification':
          await this.updateNotificationFeed();
          break;
        case 'queue':
          await this.updateQueueFeed();
          break;
        default:
          throw new Error(`Unknown feed type: ${feedType}`);
      }
    } else {
      console.log('Manual update requested for all feeds');
      await this.fetchAllFeeds();
    }
  }
}

module.exports = new Scheduler();