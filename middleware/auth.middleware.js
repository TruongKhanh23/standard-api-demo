const jwt = require("jsonwebtoken");

exports.auth = (requiredScope, allowedRoles = []) => (req, res, next) => {
  console.log("=== AUTH MIDDLEWARE START ===");

  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json(error("UNAUTHORIZED", "Missing token", req));
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, "secret-key");

    console.log("Decoded JWT:", decoded);

    // attach user
    req.user = decoded;

    // CASE 1: CLIENT TOKEN (scope-based)
    if (decoded.type === "client") {
      const userScopes = decoded.scope ? decoded.scope.split(" ") : [];

      console.log("Client Scopes:", userScopes);
      console.log("Required Scope:", requiredScope);

      if (!userScopes.includes(requiredScope)) {
        console.log("Scope check FAILED");
        return res.status(403).json(
          error("FORBIDDEN", "Insufficient scope", req)
        );
      }

      console.log("Scope check PASSED");
      return next();
    }

    // CASE 2: USER TOKEN (role-based)
    if (decoded.type === "user") {
      console.log("User Role:", decoded.role);
      console.log("Allowed Roles:", allowedRoles);

      // 👉 Nếu route không yêu cầu role thì cho qua
      if (!allowedRoles || allowedRoles.length === 0) {
        return next();
      }

      if (!allowedRoles.includes(decoded.role)) {
        console.log("Role check FAILED");
        return res.status(403).json(
          error("FORBIDDEN", "Insufficient role", req)
        );
      }

      console.log("Role check PASSED");
      return next();
    }

    // UNKNOWN TOKEN TYPE
    return res.status(401).json(
      error("INVALID_TOKEN", "Unknown token type", req)
    );

  } catch (err) {
    console.log("Token verification FAILED:", err.message);

    return res.status(401).json(
      error("INVALID_TOKEN", "Invalid token", req)
    );
  }
};