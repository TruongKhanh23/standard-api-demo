const service = require("../services/policy.service");
const { createPolicy } = require("../models/policy.model");

// DATA CLASSIFICATION
const FIELD_CLASSIFICATION = {
  id: "PUBLIC",
  internalId: "CONFIDENTIAL",
  accountBalance: "SENSITIVE",
  policyNumber: "PUBLIC",
  premiumAmount: "PUBLIC",
  currency: "PUBLIC",
  status: "PUBLIC",
  version: "INTERNAL",
  createdAt: "INTERNAL",
  updatedAt: "INTERNAL",
};

// RBAC POLICY
const FIELD_ACCESS = {
  USER: {
    CONFIDENTIAL: "exclude",
    SENSITIVE: "mask",
    INTERNAL: "exclude",
    PUBLIC: "full",
  },
  DEV: {
    CONFIDENTIAL: "exclude",
    SENSITIVE: "full",
    INTERNAL: "full",
    PUBLIC: "full",
  },
  ADMIN: {
    CONFIDENTIAL: "exclude",
    SENSITIVE: "full",
    INTERNAL: "full",
    PUBLIC: "full",
  },
};

// MASK FUNCTIONS
function maskBalance(value) {
  if (!value) return value;
  return "****" + value.toString().slice(-4);
}

function isDebugMode(req) {
  return req.headers["x-debug-mode"]?.toString().toLowerCase() === "true";
}

function mapResponse(policy, req) {
  const debug = isDebugMode(req);

  const user = req.user;
  const role = user?.role || "USER";

  // strict debug control
  if (debug && (role === "ADMIN" || role === "DEV")) {
    return policy;
  }

  const accessPolicy = FIELD_ACCESS[role] || FIELD_ACCESS.USER;

  const result = {};

  for (const key in policy) {
    const classification = FIELD_CLASSIFICATION[key] || "PUBLIC";
    const access = accessPolicy[classification] || "exclude";
    console.log("KEY:", key, "CLASS:", classification, "ACCESS:", access);
    if (access === "exclude") continue;

    if (access === "mask") {
      if (key === "accountBalance") {
        result[key] = maskBalance(policy[key]);
      } else {
        result[key] = "***";
      }
      continue;
    }

    result[key] = policy[key];
  }

  return result;
}

exports.getAll = (req, res) => {
  const result = service.getAll(req.query);

  const debug = isDebugMode(req);

  res.json({
    ...result,
    data: result.data.map((p) => mapResponse(p, req)),
  });
};

exports.getById = (req, res) => {
  const policy = service.getById(req.params.id);

  if (!policy) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  const debug = isDebugMode(req);

  res.setHeader("ETag", policy.version.toString());

  res.json(mapResponse(policy, req));
};

exports.create = (req, res) => {
  const { policyNumber, premiumAmount, currency } = req.body;

  if (req.body.id) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "id is read-only", req));
  }

  if (!policyNumber || !premiumAmount || !currency) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Missing required fields", req));
  }

  if (isNaN(premiumAmount)) {
    return res
      .status(400)
      .json(error("INVALID_AMOUNT", "premiumAmount must be number", req));
  }

  try {
    const policyData = createPolicy(req.body);
    const policy = service.create(policyData);

    const debug = isDebugMode(req);

    res.status(201).json(mapResponse(policy, req));
  } catch (err) {
    return res
      .status(400)
      .json(error("DUPLICATE", "Policy already exists", req));
  }
};

exports.update = (req, res) => {
  console.log("➡️ Controller: PUT policy", req.params.id);

  if (req.body.id) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "id is read-only", req));
  }

  const existing = service.getById(req.params.id);
  if (!existing) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  // CHECK IF-MATCH
  const ifMatch = req.headers["if-match"];

  if (!ifMatch) {
    return res
      .status(428)
      .json(error("PRECONDITION_REQUIRED", "Missing If-Match header", req));
  }

  if (parseInt(ifMatch) !== existing.version) {
    return res
      .status(412)
      .json(error("PRECONDITION_FAILED", "Resource was modified", req));
  }

  // Validate full object
  const { policyNumber, premiumAmount, currency } = req.body;

  if (!policyNumber || !premiumAmount || !currency) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Full resource required", req));
  }

  const policy = service.update(req.params.id, req.body);

  res.setHeader("ETag", policy.version.toString());

  const debug = isDebugMode(req);

  res.status(201).json(mapResponse(policy, req));
};

exports.patch = (req, res) => {
  console.log("➡️ Controller: PATCH policy", req.params.id);

  const existing = service.getById(req.params.id);
  if (!existing) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  const ifMatch = req.headers["if-match"];

  if (!ifMatch) {
    return res
      .status(428)
      .json(error("PRECONDITION_REQUIRED", "Missing If-Match header", req));
  }

  if (parseInt(ifMatch) !== existing.version) {
    return res
      .status(412)
      .json(error("PRECONDITION_FAILED", "Resource was modified", req));
  }

  if (req.body.id) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "id is read-only", req));
  }

  // 1. Empty body
  if (!req.body || Object.keys(req.body).length === 0) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Request body cannot be empty", req));
  }

  const allowedFields = ["premiumAmount", "currency", "status"];

  const invalidFields = Object.keys(req.body).filter(
    (key) => !allowedFields.includes(key),
  );

  if (invalidFields.length > 0) {
    return res
      .status(400)
      .json(
        error(
          "INVALID_FIELD",
          "Invalid fields: " + invalidFields.join(", "),
          req,
        ),
      );
  }

  // 2. Prevent system field update
  const forbiddenFields = ["id", "createdAt", "updatedAt"];
  const hasForbidden = Object.keys(req.body).some((key) =>
    forbiddenFields.includes(key),
  );

  if (hasForbidden) {
    return res
      .status(400)
      .json(error("INVALID_FIELD", "Cannot modify system fields", req));
  }

  // 3. Validate value
  if (req.body.status && !["ACTIVE", "INACTIVE"].includes(req.body.status)) {
    return res.status(400).json(error("INVALID_VALUE", "Invalid status", req));
  }

  if (req.body.premiumAmount && isNaN(req.body.premiumAmount)) {
    return res
      .status(400)
      .json(error("INVALID_VALUE", "premiumAmount must be number", req));
  }

  const policy = service.patch(req.params.id, req.body);

  if (!policy) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  const debug = isDebugMode(req);

  res.status(201).json(mapResponse(policy, req));
};

exports.topUp = async (req, res) => {
  console.log("➡️ Controller: TOP-UP", req.params.id);

  const { amount } = req.body;
  const idempotencyKey = req.headers["idempotency-key"];

  // Validate input
  if (!amount || isNaN(amount) || amount <= 0) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Amount must be positive number", req));
  }

  try {
    // Pass idempotency key xuống service
    const policy = await service.topUp(req.params.id, amount, idempotencyKey);

    if (!policy) {
      return res
        .status(404)
        .json(error("NOT_FOUND", "Policy not found", req));
    }

    // Add header để client hiểu retry semantics
    if (idempotencyKey) {
      res.set("Idempotency-Key", idempotencyKey);
    }

    res.status(201).json(mapResponse(policy, req));
  } catch (err) {
    // Handle duplicate hoặc business conflict
    if (err.message === "DUPLICATE_REQUEST") {
      return res.status(409).json({
        error: "Duplicate request detected",
        retryAfter: 2
      });
    }

    throw err; // forward to error middleware
  }
};

function error(code, message, req) {
  return {
    code,
    message,
    correlationId: req.correlationId,
  };
}

exports.delete = (req, res) => {
  const success = service.delete(req.params.id);
  if (!success) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }
  res.status(204).send();
};

exports.deactivate = (req, res) => {
  const policy = service.update(req.params.id, { status: "INACTIVE" });

  if (!policy) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  res.json(mapResponse(policy));
};