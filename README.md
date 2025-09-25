# Feedarr

RSS feed generator for media server APIs (Radarr, Sonarr, Lidarr, etc.). Generates RSS feeds from calendar, notification, and queue data.

## Features

- 🔄 **RSS Feed Generation** - Converts API data to standard RSS 2.0 format
- 📅 **Calendar Feed** - Upcoming movies/shows from your media server
- 🔔 **Notification Feed** - System notifications and alerts
- 📥 **Queue Feed** - Download queue status and progress
- 🗄️ **Smart Caching** - SQLite database with configurable TTL
- ⏱️ **Scheduled Updates** - Configurable fetch frequency
- 🔧 **Configuration Validation** - Built-in config checker
- 🐳 **Docker Ready** - Complete Docker Compose setup

## Quick Start with Docker (Recommended)

1. **Clone and configure:**

```bash
git clone <repository-url>
cd feedarr
cp .env.example .env
# Edit .env with your media server details
```

2. **Run with Docker Compose:**

```bash
docker-compose up -d
```

3. **Validate configuration:**

```bash
docker-compose exec feedarr npm run validate-config
```

4. **Access RSS feeds:**

- All feeds: http://localhost:3000/rss
- Calendar: http://localhost:3000/rss/calendar
- Queue: http://localhost:3000/rss/queue
- Notifications: http://localhost:3000/rss/notification

## Configuration

### Required Environment Variables

```env
# Target Server (Radarr/Sonarr/etc)
SERVER_URL=https://your-media-server.com
SERVER_PORT=443
API_KEY=your-api-key-here
API_BASE_URL=/api/v3
```

### Optional Configuration

```env
# Local Server
PORT=3000

# Update Frequency (milliseconds)
FETCH_FREQUENCY=300000  # 5 minutes
RSS_CACHE_TTL=600000    # 10 minutes

# Database
DATABASE_PATH=./data/feedarr.db
```

## Local Development

### Prerequisites

- Node.js 18+
- npm

### Setup

```bash
npm install
cp .env.example .env
# Edit .env with your configuration
```

### Development Commands

```bash
npm run dev              # Start with nodemon
npm start               # Production start
npm test               # Run test suite
npm run validate-config # Check configuration
```

## API Endpoints

### RSS Feeds

- `GET /rss` - Feed discovery and information
- `GET /rss/calendar` - Calendar RSS feed
- `GET /rss/notification` - Notifications RSS feed
- `GET /rss/queue` - Queue RSS feed

### Management

- `GET /` - Welcome and server info
- `GET /health` - Health check with detailed status
- `GET /rss/status` - RSS service status and statistics
- `POST /rss/refresh` - Manual refresh all feeds
- `POST /rss/refresh/{type}` - Refresh specific feed
- `DELETE /rss/cache` - Clear all caches
- `DELETE /rss/cache/{type}` - Clear specific feed cache

## Docker Compose Options

### Basic Setup

```yaml
version: "3.8"
services:
  feedarr:
    build: .
    ports:
      - "3000:3000"
    environment:
      - SERVER_URL=https://your-media-server.com
      - API_KEY=your-api-key
    volumes:
      - feedarr_data:/app/data
```

### Advanced Setup with Traefik

```yaml
services:
  feedarr:
    build: .
    labels:
      - "traefik.enable=true"
      - "traefik.http.routers.feedarr.rule=Host(`feedarr.yourdomain.com`)"
    networks:
      - traefik
```

## Health Monitoring

The application includes comprehensive health checks:

- **HTTP Health Endpoint**: `GET /health`
- **Docker Health Check**: Built into container
- **Configuration Validation**: `npm run validate-config`

## Supported Media Servers

- **Radarr** - Movie management
- **Sonarr** - TV show management
- **Lidarr** - Music management
- Any server with compatible `/api/v3` endpoints

## Troubleshooting

### Configuration Issues

```bash
# Check configuration
npm run validate-config

# Common issues:
# - Invalid API key
# - Wrong server URL/port
# - Network connectivity
# - Missing permissions
```

### Docker Issues

```bash
# Check logs
docker-compose logs feedarr

# Restart container
docker-compose restart feedarr

# Rebuild after code changes
docker-compose build --no-cache
```

## Project Structure

```
.
├── src/
│   ├── api/
│   │   ├── routes/         # Express routes
│   │   └── services/       # Business logic
│   ├── config/            # Database configuration
│   ├── db/migrations/     # Database schema
│   └── utils/            # Validation tools
├── tests/                # Test suite
├── docker-compose.yml    # Docker setup
└── Dockerfile           # Container definition
```

## License

MIT
