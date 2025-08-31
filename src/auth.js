const jwt = require("jsonwebtoken");
const jwkToPem = require("jwk-to-pem");
const fetch = require("node-fetch");

let cache; // { keys, exp }

async function getJwks(userPoolId, region) {
  const now = Date.now();
  if (cache && cache.exp > now) return cache.keys;
  const url = `https://cognito-idp.${region}.amazonaws.com/${userPoolId}/.well-known/jwks.json`;
  const res = await fetch(url);
  const { keys } = await res.json();
  cache = { keys, exp: now + 60 * 60 * 1000 };
  return keys;
}

async function verify(token, { userPoolId, region, audience }) {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded?.header?.kid) throw new Error("Invalid token header");
  const keys = await getJwks(userPoolId, region);
  const jwk = keys.find(k => k.kid === decoded.header.kid);
  if (!jwk) throw new Error("Signing key not found");
  const pem = jwkToPem(jwk);
  return new Promise((resolve, reject) => {
    jwt.verify(token, pem, { algorithms: ["RS256"], audience, issuer: `https://cognito-idp.${region}.amazonaws.com/${userPoolId}` },
      (err, payload) => err ? reject(err) : resolve(payload));
  });
}

async function authenticate(req, res, next) {
  try {
    const auth = req.headers.authorization || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) return res.status(401).json({ error: "Missing Bearer token" });

    const payload = await verify(token, {
      userPoolId: process.env.USER_POOL_ID,
      region: process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION,
      audience: process.env.COGNITO_CLIENT_ID // optional but recommended
    });
    req.user = payload;
    next();
  } catch (e) {
    return res.status(401).json({ error: "Unauthorized", detail: e.message });
  }
}

module.exports = { authenticate };
