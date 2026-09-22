'use strict';

/**
 * Base application error. All domain errors extend this.
 * Carries an HTTP status code and a machine-readable code string.
 */
class AppError extends Error {
  constructor(message, statusCode, code, field = null) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.field = field;
  }
}

class ValidationError extends AppError {
  constructor(message, field = null) {
    super(message, 400, 'VALIDATION_ERROR', field);
    this.name = 'ValidationError';
  }
}

class NotFoundError extends AppError {
  constructor(message = 'Resource not found') {
    super(message, 404, 'INCIDENT_NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

class InvalidTransitionError extends AppError {
  constructor(message) {
    super(message, 409, 'INVALID_STATUS_TRANSITION');
    this.name = 'InvalidTransitionError';
  }
}

class DatabaseError extends AppError {
  constructor(message = 'Database operation failed') {
    super(message, 500, 'DATABASE_ERROR');
    this.name = 'DatabaseError';
  }
}

class UnauthorizedError extends AppError {
  constructor(message = 'Unauthorized') {
    super(message, 401, 'UNAUTHORIZED');
    this.name = 'UnauthorizedError';
  }
}

module.exports = {
  AppError,
  ValidationError,
  NotFoundError,
  InvalidTransitionError,
  DatabaseError,
  UnauthorizedError,
};
