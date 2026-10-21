import axios from 'axios';

const api = axios.create({
  baseURL: process.env.REACT_APP_API_URL || '/api',
  timeout: 15000
});

api.interceptors.request.use((config) => {
  try {
    const session = JSON.parse(localStorage.getItem('mentoring.session'));
    if (session?.token) config.headers.Authorization = `Bearer ${session.token}`;
  } catch {
    localStorage.removeItem('mentoring.session');
  }
  return config;
});

api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && !error.config?.url?.includes('/auth/login')) {
      localStorage.removeItem('mentoring.session');
      window.dispatchEvent(new Event('mentoring:session-expired'));
    }
    return Promise.reject(error);
  }
);

export default api;
