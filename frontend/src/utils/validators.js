/**
 * Frontend form validation. Mirrors backend/src/validators/incidentValidator.js
 * for immediate feedback — the backend remains the authoritative gate and its
 * field-level errors are surfaced on the form as well.
 */

function lengthError(value, field, label, min, max) {
  const v = (value || '').trim();
  if (v.length === 0) return `${label} is required.`;
  if (v.length < min) return `${label} must be at least ${min} characters.`;
  if (v.length > max) return `${label} must not exceed ${max} characters.`;
  return null;
}

export function validateIncidentFields(data) {
  const errors = {};

  const title = lengthError(data.title, 'title', 'Title', 5, 200);
  if (title) errors.title = title;

  const description = lengthError(data.description, 'description', 'Description', 10, 2000);
  if (description) errors.description = description;

  if (!(data.service || '').trim()) errors.service = 'Service is required.';

  const impact = lengthError(data.businessImpact, 'businessImpact', 'Business impact', 5, 500);
  if (impact) errors.businessImpact = impact;

  return errors;
}

export function validateResolutionNote(note) {
  const v = (note || '').trim();
  if (v.length < 10) return 'Resolution note must be at least 10 characters.';
  if (v.length > 2000) return 'Resolution note must not exceed 2000 characters.';
  return null;
}
