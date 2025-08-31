const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const fetch = require("node-fetch");

let cacheKeys;

async function getKeys(userPoolId, region) {
  if (!cacheKeys) {
    const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
    const res = await fetch(url);
    cacheKeys = await res.json();
  }
  return cacheKeys.keys;
}

async function authenticate(req, res, next) {
  try {
    const token = req.headers.authorization?.split(" ")[1];
    if (!token) return res.status(401).json({ error: "Unauthorized" });

    const decoded = jwt.decode(token, { complete: true });
    const keys = await getKeys(process.env.USER_POOL_ID, process.env.AWS_REGION);
    const key = keys.find(k => k.kid === decoded.header.kid);
    const pem = jwkToPem(key);

    jwt.verify(token, pem, (err, payload) => {
      if (err) return res.status(401).json({ error: "Invalid token" });
      req.user = payload;
      next();
    });
  } catch (err) {
    res.status(401).json({ error: "Unauthorized" });
  }
}

module.exports = { authenticate };
