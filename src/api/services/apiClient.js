const axios = require('axios');

class ApiClient {
  constructor() {
    this.baseURL = `${process.env.SERVER_URL}:${process.env.SERVER_PORT}${process.env.API_BASE_URL}`;
    this.apiKey = process.env.API_KEY;

    this.client = axios.create({
      baseURL: this.baseURL,
      headers: {
        'X-Api-Key': this.apiKey,
        'Content-Type': 'application/json'
      },
      timeout: 30000
    });

    this.client.interceptors.response.use(
      (response) => response,
      (error) => {
        console.error(`API Error: ${error.response?.status} - ${error.response?.statusText}`);
        console.error(`URL: ${error.config?.url}`);
        if (error.response?.data) {
          console.error(`Response: ${JSON.stringify(error.response.data)}`);
        }
        throw error;
      }
    );
  }

  async getCalendar(params = {}) {
    try {
      const response = await this.client.get('/calendar', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching calendar data:', error.message);
      throw error;
    }
  }

  async getNotifications() {
    try {
      const response = await this.client.get('/notification');
      return response.data;
    } catch (error) {
      console.error('Error fetching notifications:', error.message);
      throw error;
    }
  }

  async getQueue(params = {}) {
    try {
      const response = await this.client.get('/queue', { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching queue data:', error.message);
      throw error;
    }
  }
}

module.exports = new ApiClient();