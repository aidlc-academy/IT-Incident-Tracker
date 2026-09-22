import { api, toQuery } from './client';

/**
 * Search and filtering are performed by the backend against persisted
 * DynamoDB data — the frontend never filters a stale local array.
 */
export const listIncidents = (filters) => api.get(`/api/incidents${toQuery(filters)}`);
export const getIncident = (id) => api.get(`/api/incidents/${encodeURIComponent(id)}`);
export const createIncident = (data) => api.post('/api/incidents', data);
export const updateIncident = (id, patch) => api.put(`/api/incidents/${encodeURIComponent(id)}`, patch);
export const deleteIncident = (id) => api.del(`/api/incidents/${encodeURIComponent(id)}`);
