import { api } from './client';

/** Dashboard counters, computed by the backend from persisted incidents. */
export const getStats = () => api.get('/api/stats');
