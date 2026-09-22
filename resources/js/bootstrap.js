import axios from 'axios';
window.axios = axios;

window.axios.defaults.headers.common['X-Requested-With'] = 'XMLHttpRequest';

let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
    failedQueue.forEach((prom) => {
        if (error) {
            prom.reject(error);
        } else {
            prom.resolve(token);
        }
    });
    failedQueue = [];
};

axios.interceptors.response.use(
    (response) => response,
    async (error) => {
        const originalRequest = error.config;

        // If CSRF token mismatch (419), refresh token and retry transparently
        if (error.response && error.response.status === 419 && originalRequest && !originalRequest._retry) {
            if (isRefreshing) {
                return new Promise((resolve, reject) => {
                    failedQueue.push({ resolve, reject });
                })
                    .then((token) => {
                        originalRequest.headers['X-CSRF-TOKEN'] = token;
                        return axios(originalRequest);
                    })
                    .catch((err) => Promise.reject(err));
            }

            originalRequest._retry = true;
            isRefreshing = true;

            try {
                const res = await axios.get('/csrf-token');
                const newToken = res.data?.csrf_token;

                if (newToken) {
                    axios.defaults.headers.common['X-CSRF-TOKEN'] = newToken;
                    originalRequest.headers['X-CSRF-TOKEN'] = newToken;

                    const meta = document.querySelector('meta[name="csrf-token"]');
                    if (meta) {
                        meta.setAttribute('content', newToken);
                    }

                    processQueue(null, newToken);
                    return axios(originalRequest);
                }
            } catch (refreshErr) {
                processQueue(refreshErr, null);
                if (window.location.pathname !== '/login') {
                    window.location.href = '/login';
                }
                return Promise.reject(refreshErr);
            } finally {
                isRefreshing = false;
            }
        }

        // Session expired / unauthorized
        if (error.response && error.response.status === 401) {
            if (window.location.pathname !== '/login') {
                window.location.href = '/login';
            }
        }

        return Promise.reject(error);
    }
);

