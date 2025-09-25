require('dotenv').config();
const axios = require('axios');
const fs = require('fs-extra');
const path = require('path');

class ConfigValidator {
  constructor() {
    this.results = {
      environment: {},
      database: {},
      targetServer: {},
      apiEndpoints: {},
      permissions: {},
      summary: { passed: 0, failed: 0, warnings: 0 }
    };
  }

  async validate() {
    console.log('🔧 Validating Feedarr Configuration\n');

    await this.validateEnvironment();
    await this.validateDatabase();
    await this.validateTargetServer();
    await this.validateApiEndpoints();
    await this.validatePermissions();

    this.printReport();
    return this.results.summary.failed === 0;
  }

  async validateEnvironment() {
    console.log('📋 Environment Variables:');

    const requiredEnvVars = [
      { key: 'SERVER_URL', description: 'Target server URL' },
      { key: 'SERVER_PORT', description: 'Target server port' },
      { key: 'API_KEY', description: 'API authentication key' },
      { key: 'API_BASE_URL', description: 'API base path' }
    ];

    const optionalEnvVars = [
      { key: 'PORT', description: 'Local server port', default: '3000' },
      { key: 'FETCH_FREQUENCY', description: 'Data fetch interval (ms)', default: '300000' },
      { key: 'RSS_CACHE_TTL', description: 'RSS cache TTL (ms)', default: '600000' },
      { key: 'DATABASE_PATH', description: 'SQLite database path', default: './data/feedarr.db' }
    ];

    // Check required variables
    for (const envVar of requiredEnvVars) {
      const value = process.env[envVar.key];
      if (!value || value === 'your-api-key-here' || value === 'your-secret-key-here') {
        this.fail(`  ❌ ${envVar.key}: Missing or default value`);
        this.results.environment[envVar.key] = { status: 'failed', value: 'missing' };
      } else {
        this.pass(`  ✅ ${envVar.key}: Set`);
        this.results.environment[envVar.key] = { status: 'passed', value: this.maskSensitive(envVar.key, value) };
      }
    }

    // Check optional variables
    for (const envVar of optionalEnvVars) {
      const value = process.env[envVar.key] || envVar.default;
      this.pass(`  ✅ ${envVar.key}: ${value}`);
      this.results.environment[envVar.key] = { status: 'passed', value };
    }

    console.log();
  }

  async validateDatabase() {
    console.log('🗄️  Database:');

    try {
      const dbPath = process.env.DATABASE_PATH || './data/feedarr.db';
      const dbDir = path.dirname(dbPath);

      // Check directory permissions
      try {
        await fs.ensureDir(dbDir);
        this.pass('  ✅ Database directory: Accessible');
        this.results.database.directory = { status: 'passed', path: dbDir };
      } catch (error) {
        this.fail(`  ❌ Database directory: Cannot create (${error.message})`);
        this.results.database.directory = { status: 'failed', error: error.message };
        return;
      }

      // Test database creation/connection
      const database = require('../config/database');
      try {
        await database.initialize();
        this.pass('  ✅ Database connection: Success');
        this.results.database.connection = { status: 'passed' };

        // Test basic operations
        await database.setCachedFeedData('test', { test: true });
        const cached = await database.getCachedFeedData('test');
        if (cached && cached.test) {
          this.pass('  ✅ Database operations: Working');
          this.results.database.operations = { status: 'passed' };
        } else {
          this.fail('  ❌ Database operations: Cache test failed');
          this.results.database.operations = { status: 'failed' };
        }

        await database.clearCachedFeedData('test');
        await database.close();
      } catch (error) {
        this.fail(`  ❌ Database connection: Failed (${error.message})`);
        this.results.database.connection = { status: 'failed', error: error.message };
      }
    } catch (error) {
      this.fail(`  ❌ Database validation: ${error.message}`);
    }

    console.log();
  }

  async validateTargetServer() {
    console.log('🌐 Target Server Connection:');

    const serverUrl = process.env.SERVER_URL;
    const serverPort = process.env.SERVER_PORT;
    const baseURL = `${serverUrl}:${serverPort}`;

    if (!serverUrl || !serverPort) {
      this.fail('  ❌ Server configuration: Missing URL or port');
      return;
    }

    try {
      // Test basic connectivity
      const response = await axios.get(baseURL, {
        timeout: 10000,
        validateStatus: () => true // Accept any status code
      });

      if (response.status < 500) {
        this.pass(`  ✅ Server reachable: ${baseURL} (HTTP ${response.status})`);
        this.results.targetServer.connectivity = { status: 'passed', url: baseURL, httpStatus: response.status };
      } else {
        this.warn(`  ⚠️  Server reachable but returning errors: ${baseURL} (HTTP ${response.status})`);
        this.results.targetServer.connectivity = { status: 'warning', url: baseURL, httpStatus: response.status };
      }

      // Check if it looks like the expected application
      const contentType = response.headers['content-type'] || '';
      if (contentType.includes('html') || response.data.toString().includes('html')) {
        this.pass('  ✅ Server type: Web application detected');
        this.results.targetServer.type = { status: 'passed', type: 'web-app' };
      } else {
        this.warn('  ⚠️  Server type: Unexpected response format');
        this.results.targetServer.type = { status: 'warning', type: 'unknown' };
      }

    } catch (error) {
      if (error.code === 'ECONNREFUSED') {
        this.fail(`  ❌ Server unreachable: ${baseURL} (Connection refused)`);
      } else if (error.code === 'ENOTFOUND') {
        this.fail(`  ❌ Server unreachable: ${baseURL} (Host not found)`);
      } else if (error.code === 'ECONNRESET') {
        this.fail(`  ❌ Server unreachable: ${baseURL} (Connection reset)`);
      } else {
        this.fail(`  ❌ Server unreachable: ${baseURL} (${error.message})`);
      }
      this.results.targetServer.connectivity = { status: 'failed', url: baseURL, error: error.message };
    }

    console.log();
  }

  async validateApiEndpoints() {
    console.log('🔌 API Endpoints:');

    const apiKey = process.env.API_KEY;
    const baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;

    if (!apiKey || apiKey === 'your-api-key-here') {
      this.fail('  ❌ API authentication: No valid API key configured');
      return;
    }

    const endpoints = [
      { path: '/calendar', name: 'Calendar' },
      { path: '/notification', name: 'Notification' },
      { path: '/queue', name: 'Queue' }
    ];

    for (const endpoint of endpoints) {
      try {
        const response = await axios.get(`${baseURL}${endpoint.path}`, {
          headers: { 'X-Api-Key': apiKey },
          timeout: 10000,
          validateStatus: () => true
        });

        if (response.status === 200) {
          const isArray = Array.isArray(response.data);
          const itemCount = isArray ? response.data.length : (response.data?.records?.length || 'unknown');
          this.pass(`  ✅ ${endpoint.name}: HTTP 200 (${itemCount} items)`);
          this.results.apiEndpoints[endpoint.name.toLowerCase()] = {
            status: 'passed',
            httpStatus: 200,
            itemCount
          };
        } else if (response.status === 401) {
          this.fail(`  ❌ ${endpoint.name}: Authentication failed (check API key)`);
          this.results.apiEndpoints[endpoint.name.toLowerCase()] = {
            status: 'failed',
            httpStatus: 401,
            error: 'Authentication failed'
          };
        } else if (response.status === 404) {
          this.fail(`  ❌ ${endpoint.name}: Endpoint not found (check API base URL)`);
          this.results.apiEndpoints[endpoint.name.toLowerCase()] = {
            status: 'failed',
            httpStatus: 404,
            error: 'Endpoint not found'
          };
        } else {
          this.warn(`  ⚠️  ${endpoint.name}: HTTP ${response.status} (unexpected)`);
          this.results.apiEndpoints[endpoint.name.toLowerCase()] = {
            status: 'warning',
            httpStatus: response.status
          };
        }
      } catch (error) {
        this.fail(`  ❌ ${endpoint.name}: ${error.message}`);
        this.results.apiEndpoints[endpoint.name.toLowerCase()] = {
          status: 'failed',
          error: error.message
        };
      }
    }

    console.log();
  }

  async validatePermissions() {
    console.log('📁 File Permissions:');

    const paths = [
      { path: './feeds', description: 'RSS feeds directory', create: true },
      { path: './data', description: 'Database directory', create: true },
      { path: './.env', description: 'Environment config', create: false }
    ];

    for (const pathInfo of paths) {
      try {
        if (pathInfo.create) {
          await fs.ensureDir(pathInfo.path);
          await fs.access(pathInfo.path, fs.constants.R_OK | fs.constants.W_OK);
          this.pass(`  ✅ ${pathInfo.description}: Read/Write access`);
          this.results.permissions[pathInfo.path] = { status: 'passed', access: 'read-write' };
        } else {
          await fs.access(pathInfo.path, fs.constants.R_OK);
          this.pass(`  ✅ ${pathInfo.description}: Read access`);
          this.results.permissions[pathInfo.path] = { status: 'passed', access: 'read' };
        }
      } catch (error) {
        if (error.code === 'ENOENT' && !pathInfo.create) {
          this.warn(`  ⚠️  ${pathInfo.description}: File not found`);
          this.results.permissions[pathInfo.path] = { status: 'warning', error: 'File not found' };
        } else {
          this.fail(`  ❌ ${pathInfo.description}: ${error.message}`);
          this.results.permissions[pathInfo.path] = { status: 'failed', error: error.message };
        }
      }
    }

    console.log();
  }

  pass(message) {
    console.log(message);
    this.results.summary.passed++;
  }

  fail(message) {
    console.log(message);
    this.results.summary.failed++;
  }

  warn(message) {
    console.log(message);
    this.results.summary.warnings++;
  }

  maskSensitive(key, value) {
    if (key.toLowerCase().includes('key') || key.toLowerCase().includes('secret')) {
      return value.length > 8 ? `${value.substring(0, 4)}...${value.substring(value.length - 4)}` : '***';
    }
    return value;
  }

  printReport() {
    console.log('📊 Summary:');
    console.log(`  ✅ Passed: ${this.results.summary.passed}`);
    console.log(`  ❌ Failed: ${this.results.summary.failed}`);
    console.log(`  ⚠️  Warnings: ${this.results.summary.warnings}`);

    if (this.results.summary.failed === 0) {
      console.log('\n🎉 Configuration validation successful! The application should work correctly.');
    } else {
      console.log('\n❗ Configuration validation failed. Please fix the issues above before running the application.');
    }

    console.log('\n💡 Next steps:');
    if (this.results.summary.failed === 0) {
      console.log('  • Run "npm start" to start the application');
      console.log('  • Access RSS feeds at http://localhost:' + (process.env.PORT || 3000) + '/rss');
      console.log('  • Check feed status at http://localhost:' + (process.env.PORT || 3000) + '/rss/status');
    } else {
      console.log('  • Update your .env file with correct values');
      console.log('  • Ensure target server is running and accessible');
      console.log('  • Verify API key is valid and has proper permissions');
      console.log('  • Run "npm run validate-config" again');
    }
  }
}

// Run validation if called directly
if (require.main === module) {
  const validator = new ConfigValidator();
  validator.validate().then(success => {
    process.exit(success ? 0 : 1);
  }).catch(error => {
    console.error('Validation failed:', error.message);
    process.exit(1);
  });
}

module.exports = ConfigValidator;