const RSS = require('rss');
const fs = require('fs-extra');
const path = require('path');

class RSSGenerator {
  constructor() {
    this.feedsDir = path.join(__dirname, '../../../feeds');
    this.ensureFeedsDirectory();
  }

  async ensureFeedsDirectory() {
    await fs.ensureDir(this.feedsDir);
  }

  createBaseFeed(title, description, feedUrl) {
    return new RSS({
      title: title,
      description: description,
      feed_url: feedUrl,
      site_url: `http://localhost:${process.env.PORT || 3000}`,
      image_url: null,
      author: 'Feedarr',
      managingEditor: 'Feedarr',
      webMaster: 'Feedarr',
      copyright: new Date().getFullYear(),
      language: 'en',
      categories: ['Movies', 'Media'],
      pubDate: new Date(),
      ttl: parseInt(process.env.RSS_CACHE_TTL) / 1000 / 60 || 10
    });
  }

  async generateCalendarFeed(calendarData) {
    const feed = this.createBaseFeed(
      'Calendar Feed',
      'Upcoming movies from calendar',
      `http://localhost:${process.env.PORT || 3000}/rss/calendar`
    );

    if (calendarData && Array.isArray(calendarData)) {
      calendarData.forEach(movie => {
        const releaseDate = movie.digitalRelease || movie.physicalRelease || movie.inCinemas || new Date();
        const description = this.buildMovieDescription(movie);

        feed.item({
          title: movie.title || 'Unknown Movie',
          description: description,
          url: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}` : '#',
          guid: `calendar-${movie.id || Date.now()}`,
          date: new Date(releaseDate),
          categories: this.getMovieCategories(movie)
        });
      });
    }

    const xml = feed.xml({ indent: true });
    await fs.writeFile(path.join(this.feedsDir, 'calendar.xml'), xml);
    return xml;
  }

  async generateNotificationFeed(notificationData) {
    const feed = this.createBaseFeed(
      'Notifications Feed',
      'System notifications and alerts',
      `http://localhost:${process.env.PORT || 3000}/rss/notification`
    );

    if (notificationData && Array.isArray(notificationData)) {
      notificationData.forEach(notification => {
        const description = this.buildNotificationDescription(notification);

        feed.item({
          title: notification.name || 'System Notification',
          description: description,
          url: '#',
          guid: `notification-${notification.id || Date.now()}`,
          date: new Date(),
          categories: ['Notification', notification.implementationName || 'System'].filter(Boolean)
        });
      });
    }

    const xml = feed.xml({ indent: true });
    await fs.writeFile(path.join(this.feedsDir, 'notification.xml'), xml);
    return xml;
  }

  async generateQueueFeed(queueData) {
    const feed = this.createBaseFeed(
      'Queue Feed',
      'Download queue status and progress',
      `http://localhost:${process.env.PORT || 3000}/rss/queue`
    );

    if (queueData && Array.isArray(queueData)) {
      queueData.forEach(item => {
        const description = this.buildQueueDescription(item);
        const movie = item.movie || {};

        feed.item({
          title: `${movie.title || 'Unknown Movie'} - ${item.status || 'Unknown Status'}`,
          description: description,
          url: movie.imdbId ? `https://www.imdb.com/title/${movie.imdbId}` : '#',
          guid: `queue-${item.id || Date.now()}`,
          date: new Date(item.added || new Date()),
          categories: ['Queue', item.status || 'Unknown'].filter(Boolean)
        });
      });
    }

    const xml = feed.xml({ indent: true });
    await fs.writeFile(path.join(this.feedsDir, 'queue.xml'), xml);
    return xml;
  }

  buildMovieDescription(movie) {
    const parts = [];

    if (movie.overview) {
      parts.push(`<p><strong>Overview:</strong> ${this.escapeHtml(movie.overview)}</p>`);
    }

    if (movie.year) {
      parts.push(`<p><strong>Year:</strong> ${movie.year}</p>`);
    }

    if (movie.status) {
      parts.push(`<p><strong>Status:</strong> ${movie.status}</p>`);
    }

    if (movie.inCinemas) {
      parts.push(`<p><strong>In Cinemas:</strong> ${new Date(movie.inCinemas).toLocaleDateString()}</p>`);
    }

    if (movie.digitalRelease) {
      parts.push(`<p><strong>Digital Release:</strong> ${new Date(movie.digitalRelease).toLocaleDateString()}</p>`);
    }

    if (movie.physicalRelease) {
      parts.push(`<p><strong>Physical Release:</strong> ${new Date(movie.physicalRelease).toLocaleDateString()}</p>`);
    }

    if (movie.genres && movie.genres.length > 0) {
      parts.push(`<p><strong>Genres:</strong> ${movie.genres.join(', ')}</p>`);
    }

    return parts.join('\n') || 'No additional information available.';
  }

  buildNotificationDescription(notification) {
    const parts = [];

    parts.push(`<p><strong>Implementation:</strong> ${this.escapeHtml(notification.implementationName || 'Unknown')}</p>`);

    if (notification.fields && notification.fields.length > 0) {
      parts.push(`<p><strong>Configuration Fields:</strong> ${notification.fields.length} fields configured</p>`);
    }

    if (notification.configContract) {
      parts.push(`<p><strong>Contract:</strong> ${this.escapeHtml(notification.configContract)}</p>`);
    }

    return parts.join('\n') || 'Notification configuration details.';
  }

  buildQueueDescription(item) {
    const parts = [];
    const movie = item.movie || {};

    parts.push(`<p><strong>Status:</strong> ${item.status || 'Unknown'}</p>`);

    if (item.size && item.sizeleft) {
      const progress = ((item.size - item.sizeleft) / item.size * 100).toFixed(1);
      parts.push(`<p><strong>Progress:</strong> ${progress}%</p>`);
    }

    if (item.quality) {
      parts.push(`<p><strong>Quality:</strong> ${item.quality.quality?.name || 'Unknown'}</p>`);
    }

    if (item.protocol) {
      parts.push(`<p><strong>Protocol:</strong> ${item.protocol}</p>`);
    }

    if (item.indexer) {
      parts.push(`<p><strong>Indexer:</strong> ${item.indexer}</p>`);
    }

    if (movie.overview) {
      parts.push(`<p><strong>Movie Overview:</strong> ${this.escapeHtml(movie.overview)}</p>`);
    }

    return parts.join('\n') || 'Queue item details.';
  }

  getMovieCategories(movie) {
    const categories = ['Movie'];

    if (movie.status) {
      categories.push(movie.status);
    }

    if (movie.genres && movie.genres.length > 0) {
      categories.push(...movie.genres.slice(0, 3));
    }

    return categories;
  }

  escapeHtml(text) {
    if (!text) return '';
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  async getFeedPath(feedType) {
    return path.join(this.feedsDir, `${feedType}.xml`);
  }

  async feedExists(feedType) {
    const feedPath = await this.getFeedPath(feedType);
    return fs.pathExists(feedPath);
  }

  async readFeed(feedType) {
    const feedPath = await this.getFeedPath(feedType);
    if (await this.feedExists(feedType)) {
      return fs.readFile(feedPath, 'utf8');
    }
    return null;
  }
}

module.exports = new RSSGenerator();