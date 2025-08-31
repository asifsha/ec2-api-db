const express = require("express");
const bodyParser = require("body-parser");
const { authenticate } = require("./auth");
const { saveItem, listItems } = require("./db");

const app = express();
app.use(bodyParser.json());

// Public health
app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "ec2-api-db", ts: new Date().toISOString() });
});

// All /items routes require Cognito JWT
app.use("/items", authenticate);

app.post("/items", async (req, res) => {
  try {
    const item = await saveItem(req.body, req.user);
    res.status(201).json(item);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

app.get("/items", async (_req, res) => {
  try {
    const items = await listItems();
    res.json(items);
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: e.message });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`API listening on ${port}`));
