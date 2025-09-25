const knex = require('knex');
const path = require('path');
const fs = require('fs-extra');

class Database {
  constructor() {
    this.db = null;
    this.isInitialized = false;
  }

  async initialize() {
    if (this.isInitialized) {
      return this.db;
    }

    try {
      // Ensure data directory exists
      const dbPath = process.env.DATABASE_PATH || './data/feedarr.db';
      const dbDir = path.dirname(dbPath);
      await fs.ensureDir(dbDir);

      // Initialize Knex with SQLite
      this.db = knex({
        client: 'sqlite3',
        connection: {
          filename: dbPath
        },
        useNullAsDefault: true,
        migrations: {
          directory: path.join(__dirname, '../db/migrations')
        }
      });

      // Run migrations
      await this.db.migrate.latest();

      this.isInitialized = true;
      console.log(`SQLite database initialized at: ${dbPath}`);

      return this.db;
    } catch (error) {
      console.error('Failed to initialize database:', error.message);
      throw error;
    }
  }

  async getDatabase() {
    if (!this.isInitialized) {
      await this.initialize();
    }
    return this.db;
  }

  async close() {
    if (this.db) {
      await this.db.destroy();
      this.isInitialized = false;
      console.log('Database connection closed');
    }
  }

  // Feed cache methods
  async getCachedFeedData(feedType) {
    const db = await this.getDatabase();
    const result = await db('feed_cache')
      .where('feed_type', feedType)
      .first();

    if (result) {
      const cacheAge = Date.now() - new Date(result.updated_at).getTime();
      const cacheTTL = parseInt(process.env.RSS_CACHE_TTL) || 600000;

      if (cacheAge < cacheTTL) {
        return JSON.parse(result.data);
      }
    }

    return null;
  }

  async setCachedFeedData(feedType, data) {
    const db = await this.getDatabase();
    const now = new Date().toISOString();

    await db('feed_cache')
      .insert({
        feed_type: feedType,
        data: JSON.stringify(data),
        created_at: now,
        updated_at: now
      })
      .onConflict('feed_type')
      .merge({
        data: JSON.stringify(data),
        updated_at: now
      });
  }

  async clearCachedFeedData(feedType = null) {
    const db = await this.getDatabase();

    if (feedType) {
      await db('feed_cache').where('feed_type', feedType).del();
    } else {
      await db('feed_cache').del();
    }
  }

  // Feed metadata methods
  async getFeedMetadata(feedType) {
    const db = await this.getDatabase();
    return await db('feed_metadata')
      .where('feed_type', feedType)
      .first();
  }

  async setFeedMetadata(feedType, metadata) {
    const db = await this.getDatabase();
    const now = new Date().toISOString();

    await db('feed_metadata')
      .insert({
        feed_type: feedType,
        last_fetch: metadata.lastFetch || now,
        item_count: metadata.itemCount || 0,
        status: metadata.status || 'success',
        error_message: metadata.errorMessage || null,
        updated_at: now
      })
      .onConflict('feed_type')
      .merge({
        last_fetch: metadata.lastFetch || now,
        item_count: metadata.itemCount || 0,
        status: metadata.status || 'success',
        error_message: metadata.errorMessage || null,
        updated_at: now
      });
  }

  async getAllFeedMetadata() {
    const db = await this.getDatabase();
    return await db('feed_metadata').select('*');
  }

  // Statistics methods
  async getStatistics() {
    const db = await this.getDatabase();

    const feedStats = await db('feed_metadata')
      .select(
        'feed_type',
        'last_fetch',
        'item_count',
        'status',
        'error_message'
      );

    const cacheStats = await db('feed_cache')
      .select(
        'feed_type',
        'updated_at'
      );

    return {
      feeds: feedStats,
      cache: cacheStats,
      totalCacheEntries: cacheStats.length
    };
  }
}

module.exports = new Database();