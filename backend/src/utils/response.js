'use strict';

const { AppError } = require('./errors');

/**
 * Build a successful response envelope.
 * @param {*}      data        - payload (object or array)
 * @param {string} [message]   - optional human-readable confirmation
 * @param {number} [status]    - HTTP status code (default 200)
 */
function success(data, message = null, status = 200) {
  const body = { success: true, data };
  if (message) body.message = message;
  if (Array.isArray(data)) body.count = data.length;
  return { statusCode: status, body };
}

/**
 * Build an error response envelope.
 * Accepts an AppError instance or a raw Error.
 * Never leaks internal stack traces.
 */
function failure(err) {
  if (err instanceof AppError) {
    const body = {
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    };
    if (err.field) body.error.field = err.field;
    return { statusCode: err.statusCode, body };
  }

  // Unexpected / unhandled error — log it, return a safe generic message
  console.error('[IncidentIQ] Unhandled error:', err);
  return {
    statusCode: 500,
    body: {
      success: false,
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'An unexpected error occurred. Please try again.',
      },
    },
  };
}

/**
 * Express-specific helper: send a success response.
 */
function sendSuccess(res, data, message = null, status = 200) {
  const { body } = success(data, message, status);
  return res.status(status).json(body);
}

/**
 * Express-specific helper: send an error response derived from any error.
 */
function sendError(res, err) {
  const { statusCode, body } = failure(err);
  return res.status(statusCode).json(body);
}

/**
 * Lambda-specific helper: build a Lambda proxy response with CORS headers.
 */
function lambdaSuccess(data, message = null, status = 200) {
  const { body } = success(data, message, status);
  return {
    statusCode: status,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

/**
 * Lambda-specific helper: build a Lambda error proxy response.
 */
function lambdaError(err) {
  const { statusCode, body } = failure(err);
  return {
    statusCode,
    headers: corsHeaders(),
    body: JSON.stringify(body),
  };
}

function corsHeaders() {
  return {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type,x-demo-user',
    'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  };
}

module.exports = { success, failure, sendSuccess, sendError, lambdaSuccess, lambdaError, corsHeaders };
