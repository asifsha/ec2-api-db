const { DynamoDBClient, PutItemCommand, ScanCommand } = require("@aws-sdk/client-dynamodb");

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const TABLE_NAME = process.env.TABLE_NAME;

async function saveItem(data) {
  const item = {
    id: { S: Date.now().toString() },
    payload: { S: JSON.stringify(data) }
  };
  await client.send(new PutItemCommand({ TableName: TABLE_NAME, Item: item }));
  return { id: item.id.S, ...data };
}

async function getItems() {
  const result = await client.send(new ScanCommand({ TableName: TABLE_NAME }));
  return result.Items.map(i => ({ id: i.id.S, payload: JSON.parse(i.payload.S) }));
}

module.exports = { saveItem, getItems };
