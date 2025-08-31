const { DynamoDBClient, PutItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");
const crypto = require("crypto");

const REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const TABLE_NAME = process.env.TABLE_NAME;

const ddb = new DynamoDBClient({ region: REGION });

async function saveItem(data, user) {
  const id = crypto.randomUUID();
  const item = {
    id: { S: id },
    createdAt: { S: new Date().toISOString() },
    userSub: { S: user?.sub || "anonymous" },
    payload: { S: JSON.stringify(data || {}) }
  };
  await ddb.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
  return { id, ok: true };
}

async function listItems() {
  const out = await ddb.send(new ScanCommand({ TableName: TABLE_NAME }));
  return (out.Items || []).map(i => ({
    id: i.id.S,
    createdAt: i.createdAt.S,
    userSub: i.userSub.S,
    payload: JSON.parse(i.payload.S)
  }));
}

module.exports = { saveItem, listItems };
