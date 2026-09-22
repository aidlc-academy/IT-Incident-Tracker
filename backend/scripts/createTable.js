'use strict';

/**
 * Create the IncidentIQ DynamoDB table if it does not already exist.
 *
 * Works against DynamoDB Local (when DYNAMODB_ENDPOINT is set) and against
 * real AWS DynamoDB (when it is not). Safe to run repeatedly.
 *
 *   npm run db:create-table
 */

require('dotenv').config();

const {
  DynamoDBClient,
  CreateTableCommand,
  DescribeTableCommand,
  ResourceNotFoundException,
} = require('@aws-sdk/client-dynamodb');

const TABLE    = process.env.DYNAMODB_TABLE || 'incidentiq-incidents';
const REGION   = process.env.AWS_REGION || 'us-east-1';
const ENDPOINT = process.env.DYNAMODB_ENDPOINT || undefined;

const config = { region: REGION };
if (ENDPOINT) {
  config.endpoint = ENDPOINT;
  config.credentials = {
    accessKeyId:     process.env.AWS_ACCESS_KEY_ID     || 'local',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || 'local',
  };
}

const client = new DynamoDBClient(config);

async function main() {
  try {
    await client.send(new DescribeTableCommand({ TableName: TABLE }));
    console.log(`[IncidentIQ] Table '${TABLE}' already exists at ${ENDPOINT || REGION}.`);
    return;
  } catch (err) {
    if (!(err instanceof ResourceNotFoundException)) throw err;
  }

  await client.send(new CreateTableCommand({
    TableName: TABLE,
    BillingMode: 'PAY_PER_REQUEST',
    AttributeDefinitions: [
      { AttributeName: 'PK', AttributeType: 'S' },
      { AttributeName: 'SK', AttributeType: 'S' },
    ],
    KeySchema: [
      { AttributeName: 'PK', KeyType: 'HASH' },
      { AttributeName: 'SK', KeyType: 'RANGE' },
    ],
  }));

  console.log(`[IncidentIQ] Created table '${TABLE}' at ${ENDPOINT || REGION}.`);
}

main().catch((err) => {
  console.error(`[IncidentIQ] Failed to create table '${TABLE}':`, err.message);
  process.exit(1);
});
