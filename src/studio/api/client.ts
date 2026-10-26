import axios from 'axios';

// ── Node.js backend (port 4000) ──────────────────────────────────
// Auth, editor, pexels, pixabay, etc.
// Proxy Next.js : /editor-api/* → http://localhost:4000/api/*
const apiClient = axios.create({
  baseURL: '/editor-api',
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});

apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response?.status === 401 && typeof window !== 'undefined') {
      if (!window.location.pathname.startsWith('/login')) {
        window.location.href = '/login';
      }
    }
    return Promise.reject(error);
  },
);

export default apiClient;

// ── CakePHP backend (BACKEND_URL env var) ─────────────────────────
// Events, instant gagnant, configurations, etc.
// Proxy Next.js : /api/* → ${BACKEND_URL}/api/*
export const cakeClient = axios.create({
  baseURL: '/api',
  headers: {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  },
});
