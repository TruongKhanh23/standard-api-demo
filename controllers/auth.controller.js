const { error } = require('../utils/response.util');
const jwt = require("jsonwebtoken");

const clients = [
  {
    clientId: "app-read",
    clientSecret: "8Fj3!kL92jDksL@23ksl!!!",
    scope: "policy.read",
  },
  {
    clientId: "app-write",
    clientSecret: "c9d8f7a6b5e4123490abc",
    scope: "policy.read policy.write",
  },
];

// giả lập user store (production sẽ là SSO)
const users = [
  {
    username: "user",
    role: "USER",
  },
  {
    username: "admin",
    role: "ADMIN",
  },
  {
    username: "dev",
    role: "DEV",
  },
];

// GET TOKEN
exports.getToken = (req, res) => {
  const grantType = req.body.grant_type;

  console.log("Grant Type:", grantType);

  if (!grantType) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing grant_type",
    });
  }

  // 1. CLIENT CREDENTIALS (Service Account)
  if (grantType === "client_credentials") {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Basic ")) {
      return res.status(401).json({ error: "invalid_client" });
    }

    const base64 = authHeader.split(" ")[1];
    const decodedStr = Buffer.from(base64, "base64").toString("utf-8");
    const [clientId, clientSecret] = decodedStr.split(":");

    const client = clients.find(
      (c) => c.clientId === clientId && c.clientSecret === clientSecret,
    );

    if (!client) {
      return res.status(401).json({ error: "invalid_client" });
    }

    const token = jwt.sign(
      {
        sub: client.clientId,
        type: "client",
        scope: client.scope,
      },
      "secret-key",
      { expiresIn: "1h" },
    );

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
      scope: client.scope,
    });
  }

  // 2. AUTHORIZATION CODE (User Account - simulate)
  if (grantType === "authorization_code") {
    const { code } = req.body;

    if (!code) {
      return res.status(400).json({
        error: "invalid_request",
        error_description: "Missing authorization code",
      });
    }

    // decode auth code (demo)
    const username = Buffer.from(code, "base64").toString("utf-8");

    const user = users.find((u) => u.username === username);

    if (!user) {
      return res.status(401).json({ error: "invalid_code" });
    }

    const token = jwt.sign(
      {
        sub: user.username,
        type: "user",    // user token
        role: user.role, // RBAC
      },
      "secret-key",
      { expiresIn: "1h" },
    );

    return res.json({
      access_token: token,
      token_type: "Bearer",
      expires_in: 3600,
      role: user.role,
    });
  }

  // Unsupported
  return res.status(400).json({
    error: "unsupported_grant_type",
  });
};

// SIMULATE AUTHORIZE ENDPOINT (for demo)
exports.authorize = (req, res) => {
  const { username } = req.query;

  const user = users.find((u) => u.username === username);

  if (!user) {
    return res.status(401).send("Invalid user");
  }

  // simulate auth code
  const code = Buffer.from(username).toString("base64");

  return res.json({
    code,
  });
};
