const express = require('express');
const rssGenerator = require('../services/rssGenerator');
const scheduler = require('../services/scheduler');
const database = require('../../config/database');

const router = express.Router();

// RSS Feed endpoints
router.get('/calendar', async (req, res) => {
  try {
    const feed = await rssGenerator.readFeed('calendar');

    if (!feed) {
      return res.status(404).json({
        error: 'Calendar RSS feed not found',
        message: 'Feed may not have been generated yet. Try again in a few minutes.'
      });
    }

    res.set({
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${parseInt(process.env.RSS_CACHE_TTL) / 1000 || 600}`
    });

    res.send(feed);
  } catch (error) {
    console.error('Error serving calendar RSS feed:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to serve calendar RSS feed'
    });
  }
});

router.get('/notification', async (req, res) => {
  try {
    const feed = await rssGenerator.readFeed('notification');

    if (!feed) {
      return res.status(404).json({
        error: 'Notification RSS feed not found',
        message: 'Feed may not have been generated yet. Try again in a few minutes.'
      });
    }

    res.set({
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${parseInt(process.env.RSS_CACHE_TTL) / 1000 || 600}`
    });

    res.send(feed);
  } catch (error) {
    console.error('Error serving notification RSS feed:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to serve notification RSS feed'
    });
  }
});

router.get('/queue', async (req, res) => {
  try {
    const feed = await rssGenerator.readFeed('queue');

    if (!feed) {
      return res.status(404).json({
        error: 'Queue RSS feed not found',
        message: 'Feed may not have been generated yet. Try again in a few minutes.'
      });
    }

    res.set({
      'Content-Type': 'application/rss+xml; charset=utf-8',
      'Cache-Control': `public, max-age=${parseInt(process.env.RSS_CACHE_TTL) / 1000 || 600}`
    });

    res.send(feed);
  } catch (error) {
    console.error('Error serving queue RSS feed:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to serve queue RSS feed'
    });
  }
});

// Status and control endpoints
router.get('/status', async (req, res) => {
  try {
    const status = await scheduler.getStatus();

    res.json({
      ...status,
      availableFeeds: ['calendar', 'notification', 'queue'],
      feedUrls: {
        calendar: `${req.protocol}://${req.get('host')}/rss/calendar`,
        notification: `${req.protocol}://${req.get('host')}/rss/notification`,
        queue: `${req.protocol}://${req.get('host')}/rss/queue`
      }
    });
  } catch (error) {
    console.error('Error getting RSS status:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to get RSS status'
    });
  }
});

router.post('/refresh/:feedType?', async (req, res) => {
  try {
    const { feedType } = req.params;

    if (feedType && !['calendar', 'notification', 'queue'].includes(feedType)) {
      return res.status(400).json({
        error: 'Invalid feed type',
        message: 'Feed type must be one of: calendar, notification, queue'
      });
    }

    // Clear cache to force fresh data
    await database.clearCachedFeedData(feedType);
    await scheduler.manualUpdate(feedType);

    res.json({
      message: feedType ? `${feedType} feed refreshed successfully` : 'All feeds refreshed successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error refreshing RSS feeds:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to refresh RSS feeds'
    });
  }
});

router.delete('/cache/:feedType?', async (req, res) => {
  try {
    const { feedType } = req.params;

    if (feedType && !['calendar', 'notification', 'queue'].includes(feedType)) {
      return res.status(400).json({
        error: 'Invalid feed type',
        message: 'Feed type must be one of: calendar, notification, queue'
      });
    }

    await database.clearCachedFeedData(feedType);

    res.json({
      message: feedType ? `${feedType} cache cleared successfully` : 'All caches cleared successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error clearing cache:', error.message);
    res.status(500).json({
      error: 'Internal server error',
      message: 'Unable to clear cache'
    });
  }
});

// Feed discovery endpoint
router.get('/', (req, res) => {
  res.json({
    message: 'Feedarr RSS Service',
    availableFeeds: {
      calendar: {
        url: `${req.protocol}://${req.get('host')}/rss/calendar`,
        description: 'Upcoming movies from calendar'
      },
      notification: {
        url: `${req.protocol}://${req.get('host')}/rss/notification`,
        description: 'System notifications and alerts'
      },
      queue: {
        url: `${req.protocol}://${req.get('host')}/rss/queue`,
        description: 'Download queue status and progress'
      }
    },
    endpoints: {
      status: `${req.protocol}://${req.get('host')}/rss/status`,
      refresh: `${req.protocol}://${req.get('host')}/rss/refresh`,
      refreshSpecific: `${req.protocol}://${req.get('host')}/rss/refresh/{feedType}`,
      clearCache: `${req.protocol}://${req.get('host')}/rss/cache`,
      clearCacheSpecific: `${req.protocol}://${req.get('host')}/rss/cache/{feedType}`
    }
  });
});

module.exports = router;