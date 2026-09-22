import { api } from './client';

export const login = (username) => api.post('/api/login', { username });
export const logout = () => api.post('/api/logout', {});
