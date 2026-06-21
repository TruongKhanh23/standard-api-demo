const jwt = require("jsonwebtoken");

const clients = [
  {
    clientId: "app-read",
    clientSecret: "8Fj3!kL92jDksL@23ksl!!!",
    scope: "",
  },
  {
    clientId: "app-write",
    clientSecret: "c9d8f7a6b5e4123490abc",
    scope: "policy.read policy.write",
  },
];

exports.getToken = (req, res) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Basic ")) {
    return res.status(401).json({ error: "invalid_client" });
  }

  // parse clientId / secret
  const base64 = authHeader.split(" ")[1];
  const decodedStr = Buffer.from(base64, "base64").toString("utf-8");
  const [clientId, clientSecret] = decodedStr.split(":");

  // ✅ ADD CHECK grant_type
  const grantType = req.body.grant_type;

  console.log("Grant Type:", grantType);

  if (!grantType) {
    return res.status(400).json({
      error: "invalid_request",
      error_description: "Missing grant_type"
    });
  }

  if (grantType !== "client_credentials") {
    return res.status(400).json({
      error: "unsupported_grant_type"
    });
  }

  // validate client
  const client = clients.find(
    c => c.clientId === clientId && c.clientSecret === clientSecret
  );

  if (!client) {
    return res.status(401).json({ error: "invalid_client" });
  }

  const token = jwt.sign(
    { scope: client.scope },
    "secret-key",
    { expiresIn: "1h" }
  );

  res.json({
    access_token: token,
    token_type: "Bearer",
    expires_in: 3600,
    scope: client.scope
  });
};
