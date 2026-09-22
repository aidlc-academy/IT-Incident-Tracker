'use strict';

/**
 * Incident Repository — storage-adapter factory.
 *
 * Exports a single factory function `createRepository(mode)` that returns
 * a repository object with the same four-method interface regardless of
 * storage backend:
 *
 *   readAll(filters?)   → Incident[]
 *   readOne(id)         → Incident | null
 *   save(incident)      → Incident          (create or full replace)
 *   remove(id)          → boolean           (true if existed)
 *
 * Supported modes:
 *   'local'    — JSON file on disk  (default, no AWS needed)
 *   'dynamodb' — DynamoDB table
 *
 * The service layer only depends on this interface, never on raw DynamoDB
 * or file-system calls.
 */

const { DatabaseError } = require('../utils/errors');
const { STATUSES } = require('../models/incident');

// ───────────────────────────────────────────────────────────────────────────
// LOCAL (JSON file) adapter
// ───────────────────────────────────────────────────────────────────────────

const fs   = require('fs');
const path = require('path');

function localAdapter(dataFile) {
  const filePath = path.resolve(dataFile);

  function _read() {
    try {
      if (!fs.existsSync(filePath)) {
        fs.mkdirSync(path.dirname(filePath), { recursive: true });
        fs.writeFileSync(filePath, JSON.stringify({ incidents: [] }), 'utf8');
      }
      return JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (err) {
      throw new DatabaseError(`Failed to read data file: ${err.message}`);
    }
  }

  function _write(store) {
    try {
      const tmp = filePath + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
      fs.renameSync(tmp, filePath);
    } catch (err) {
      throw new DatabaseError(`Failed to write data file: ${err.message}`);
    }
  }

  return {
    async readAll(filters = {}) {
      let incidents = _read().incidents;
      incidents = _applyFilters(incidents, filters);
      return _sortNewestFirst(incidents);
    },

    async readOne(id) {
      const store = _read();
      return store.incidents.find((i) => i.id === id) || null;
    },

    async save(incident) {
      const store = _read();
      const idx = store.incidents.findIndex((i) => i.id === incident.id);
      if (idx >= 0) {
        store.incidents[idx] = incident;
      } else {
        store.incidents.push(incident);
      }
      _write(store);
      return incident;
    },

    async remove(id) {
      const store = _read();
      const idx = store.incidents.findIndex((i) => i.id === id);
      if (idx < 0) return false;
      store.incidents.splice(idx, 1);
      _write(store);
      return true;
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// DYNAMODB adapter
// ───────────────────────────────────────────────────────────────────────────

function dynamoAdapter(tableName, region) {
  // Lazy-load so the local mode doesn't require AWS SDK to be present.
  const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
  const {
    DynamoDBDocumentClient,
    QueryCommand,
    GetCommand,
    PutCommand,
    DeleteCommand,
  } = require('@aws-sdk/lib-dynamodb');

  const raw    = new DynamoDBClient({ region });
  const client = DynamoDBDocumentClient.from(raw);

  const PK = 'INCIDENT'; // partition key value — all incidents share one partition

  return {
    async readAll(filters = {}) {
      try {
        const result = await client.send(
          new QueryCommand({
            TableName: tableName,
            KeyConditionExpression: 'PK = :pk',
            ExpressionAttributeValues: { ':pk': PK },
          })
        );
        let incidents = (result.Items || []).map(_stripKeys);
        incidents = _applyFilters(incidents, filters);
        return _sortNewestFirst(incidents);
      } catch (err) {
        throw new DatabaseError(`DynamoDB readAll failed: ${err.message}`);
      }
    },

    async readOne(id) {
      try {
        const result = await client.send(
          new GetCommand({
            TableName: tableName,
            Key: { PK, SK: id },
          })
        );
        return result.Item ? _stripKeys(result.Item) : null;
      } catch (err) {
        throw new DatabaseError(`DynamoDB readOne failed: ${err.message}`);
      }
    },

    async save(incident) {
      try {
        await client.send(
          new PutCommand({
            TableName: tableName,
            Item: { PK, SK: incident.id, ...incident },
          })
        );
        return incident;
      } catch (err) {
        throw new DatabaseError(`DynamoDB save failed: ${err.message}`);
      }
    },

    async remove(id) {
      try {
        // Check existence first so we can return an accurate boolean.
        const existing = await client.send(
          new GetCommand({ TableName: tableName, Key: { PK, SK: id } })
        );
        if (!existing.Item) return false;

        await client.send(
          new DeleteCommand({ TableName: tableName, Key: { PK, SK: id } })
        );
        return true;
      } catch (err) {
        throw new DatabaseError(`DynamoDB remove failed: ${err.message}`);
      }
    },
  };
}

// ───────────────────────────────────────────────────────────────────────────
// Shared filter + sort helpers
// ───────────────────────────────────────────────────────────────────────────

function _applyFilters(incidents, filters) {
  let result = incidents;

  if (filters.search) {
    const q = filters.search.toLowerCase();
    result = result.filter(
      (i) =>
        (i.id          || '').toLowerCase().includes(q) ||
        (i.title       || '').toLowerCase().includes(q) ||
        (i.description || '').toLowerCase().includes(q) ||
        (i.service     || '').toLowerCase().includes(q)
    );
  }

  if (filters.status) {
    result = result.filter((i) => i.status === filters.status);
  }

  if (filters.priority) {
    result = result.filter((i) => i.priority === filters.priority);
  }

  if (filters.severity) {
    result = result.filter((i) => i.severity === filters.severity);
  }

  return result;
}

function _sortNewestFirst(incidents) {
  return [...incidents].sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

/** Remove DynamoDB table-key attributes (PK, SK) from the returned object. */
function _stripKeys(item) {
  const { PK: _pk, SK: _sk, ...rest } = item;
  return rest;
}

// ───────────────────────────────────────────────────────────────────────────
// Factory
// ───────────────────────────────────────────────────────────────────────────

/**
 * Create a repository for the given storage mode.
 *
 * @param {'local'|'dynamodb'} mode
 * @param {object}            [opts]
 * @param {string}            [opts.dataFile]   used when mode === 'local'
 * @param {string}            [opts.tableName]  used when mode === 'dynamodb'
 * @param {string}            [opts.region]     used when mode === 'dynamodb'
 * @returns repository interface
 */
function createRepository(mode, opts = {}) {
  if (mode === 'dynamodb') {
    const tableName = opts.tableName || process.env.DYNAMODB_TABLE;
    const region    = opts.region    || process.env.AWS_REGION || 'us-east-1';
    if (!tableName) throw new Error('DYNAMODB_TABLE env var is required in dynamodb mode.');
    return dynamoAdapter(tableName, region);
  }

  // Default: local JSON file
  const dataFile = opts.dataFile || process.env.DATA_FILE || './data/incidents.json';
  return localAdapter(dataFile);
}

module.exports = { createRepository };
