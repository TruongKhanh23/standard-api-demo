const jwt = require("jsonwebtoken");

exports.auth = (requiredScope) => (req, res, next) => {
  console.log("=== AUTH MIDDLEWARE START ===");

  const authHeader = req.headers.authorization;
  console.log("Authorization Header:", authHeader);

  // 1. Check header
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    console.log("❌ Missing or invalid Authorization header");
    return res.status(401).json(error("UNAUTHORIZED", "Missing token", req));
  }

  // 2. Extract token
  const token = authHeader.split(" ")[1];
  console.log("Extracted Token:", token);

  try {
    // 3. Verify token
    const decoded = jwt.verify(token, "secret-key");
    console.log("✅ Decoded JWT:", decoded);

    // 4. Extract scope
    const userScopes = decoded.scope ? decoded.scope.split(" ") : [];
    console.log("User Scopes:", userScopes);
    console.log("Required Scope:", requiredScope);

    // 5. Check permission
    if (!userScopes.includes(requiredScope)) {
      console.log("❌ Scope check FAILED");
      return res.status(403).json(
        error("FORBIDDEN", "Insufficient scope", req)
      );
    }

    console.log("✅ Scope check PASSED");

    // Optional: attach user info vào request (rất hay dùng)
    req.user = decoded;

    console.log("=== AUTH PASSED ===");
    next();

  } catch (err) {
    console.log("❌ Token verification FAILED");
    console.log("Error:", err.message);

    return res.status(401).json(
      error("INVALID_TOKEN", "Invalid token", req)
    );
  }
};

function error(code, message, req) {
  return {
    code,
    message,
    correlationId: req.correlationId
  };
}