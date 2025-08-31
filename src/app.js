const express = require("express");
const bodyParser = require("body-parser");
const { saveItem, getItems } = require("./db");
const { authenticate } = require("./auth");

const app = express();
app.use(bodyParser.json());

// Public health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", service: "api-ec2-dynamo", ts: new Date().toISOString() });
});

// Authenticated routes
app.use(authenticate);

app.post("/items", async (req, res) => {
  const item = await saveItem(req.body);
  res.status(201).json(item);
});

app.get("/items", async (req, res) => {
  const items = await getItems();
  res.json(items);
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API running on port ${port}`));
