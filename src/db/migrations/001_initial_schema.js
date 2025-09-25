exports.up = async function(knex) {
  // Feed cache table to store raw API responses
  await knex.schema.createTable('feed_cache', function(table) {
    table.string('feed_type').primary(); // 'calendar', 'notification', 'queue'
    table.text('data'); // JSON data from API
    table.datetime('created_at').notNullable();
    table.datetime('updated_at').notNullable();
  });

  // Feed metadata table to track feed status and statistics
  await knex.schema.createTable('feed_metadata', function(table) {
    table.string('feed_type').primary(); // 'calendar', 'notification', 'queue'
    table.datetime('last_fetch'); // When was the feed last fetched
    table.integer('item_count').defaultTo(0); // Number of items in the feed
    table.string('status').defaultTo('pending'); // 'success', 'error', 'pending'
    table.text('error_message').nullable(); // Error message if fetch failed
    table.datetime('updated_at').notNullable();
  });

  // Create indexes for better performance
  await knex.schema.raw('CREATE INDEX idx_feed_cache_updated_at ON feed_cache(updated_at)');
  await knex.schema.raw('CREATE INDEX idx_feed_metadata_last_fetch ON feed_metadata(last_fetch)');
  await knex.schema.raw('CREATE INDEX idx_feed_metadata_status ON feed_metadata(status)');
};

exports.down = async function(knex) {
  await knex.schema.dropTableIfExists('feed_metadata');
  await knex.schema.dropTableIfExists('feed_cache');
};