import axios, { AxiosInstance, AxiosResponse, InternalAxiosRequestConfig } from 'axios';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000/api/v1';

class ApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: API_URL,
      headers: {
        'Content-Type': 'application/json',
      },
    });

    // Request interceptor
    this.client.interceptors.request.use(
      (config: InternalAxiosRequestConfig) => {
        const token = localStorage.getItem('token');
        if (token && config.headers) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );

    // Response interceptor
    this.client.interceptors.response.use(
      (response: AxiosResponse) => response,
      async (error) => {
        if (error.response?.status === 401) {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          window.location.href = '/login';
        }
        return Promise.reject(error);
      }
    );
  }

  // Auth
  async login(email: string, password: string) {
    const response = await this.client.post('/auth/login', { email, password });
    return response.data;
  }

  async register(userData: any) {
    const response = await this.client.post('/auth/register', userData);
    return response.data;
  }

  async logout() {
    const response = await this.client.post('/auth/logout');
    return response.data;
  }

  async getCurrentUser() {
    const response = await this.client.get('/auth/me');
    return response.data;
  }

  // Studies
  async getStudies() {
    const response = await this.client.get('/studies');
    return response.data;
  }

  async getStudy(id: string) {
    const response = await this.client.get(`/studies/${id}`);
    return response.data;
  }

  async createStudy(data: any) {
    const response = await this.client.post('/studies', data);
    return response.data;
  }

  async updateStudy(id: string, data: any) {
    const response = await this.client.put(`/studies/${id}`, data);
    return response.data;
  }

  // Patients
  async getPatients(params?: any) {
    const response = await this.client.get('/patients', { params });
    return response.data;
  }

  async getPatient(id: string) {
    const response = await this.client.get(`/patients/${id}`);
    return response.data;
  }

  async createPatient(data: any) {
    const response = await this.client.post('/patients', data);
    return response.data;
  }

  // Randomization
  async randomizePatient(data: any) {
    const response = await this.client.post('/randomization/randomize', data);
    return response.data;
  }

  async generateRandomizationList(data: any) {
    const response = await this.client.post('/randomization/generate-list', data);
    return response.data;
  }

  // Supply Management
  async getForecast(data: any) {
    const response = await this.client.post('/supply/forecast', data);
    return response.data;
  }

  async allocateKit(data: any) {
    const response = await this.client.post('/supply/allocate-kit', data);
    return response.data;
  }

  async dispenseKit(data: any) {
    const response = await this.client.post('/supply/dispense-kit', data);
    return response.data;
  }

  // Inventory
  async getInventory(params?: any) {
    const response = await this.client.get('/inventory', { params });
    return response.data;
  }

  // Sites
  async getSites() {
    const response = await this.client.get('/sites');
    return response.data;
  }

  async getSite(id: string) {
    const response = await this.client.get(`/sites/${id}`);
    return response.data;
  }

  async createSite(data: any) {
    const response = await this.client.post('/sites', data);
    return response.data;
  }

  // Analytics
  async getDashboard(studyId: string) {
    const response = await this.client.get(`/analytics/dashboard/${studyId}`);
    return response.data;
  }

  // Shipments
  async getShipments() {
    const response = await this.client.get('/shipments');
    return response.data;
  }

  async createShipment(data: any) {
    const response = await this.client.post('/shipments', data);
    return response.data;
  }

  // Integrations
  async getIntegrations() {
    const response = await this.client.get('/integrations');
    return response.data;
  }

  async createIntegration(data: any) {
    const response = await this.client.post('/integrations', data);
    return response.data;
  }
}

export default new ApiClient();
