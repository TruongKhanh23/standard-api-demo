const { error } = require('../utils/response.util');
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

  res.status(200).json(mapResponse(policy, req));
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

  res.status(200).json(mapResponse(policy, req));
};


const ALLOWED_CURRENCIES = ['VND', 'USD']; // nếu cần

exports.topUp = async (req, res, next) => {
  console.log("➡️ Controller: TOP-UP", req.params.id);

  const { id } = req.params;
  const { amount } = req.body;
  const rawKey = req.headers["idempotency-key"];
  const idempotencyKey = typeof rawKey === "string" ? rawKey.trim() : "";

  // ─────────── 1) Validate amount ───────────
  if (typeof amount !== "number" || !Number.isFinite(amount) || amount <= 0) {
    return res.status(400).json(
      error("INVALID_REQUEST", "Field 'amount' must be a positive number", req)
    );
  }

  // Optional: chặn số quá lớn (overflow / fraud)
  if (amount > 1_000_000_000_000) {
    return res.status(422).json(
      error("AMOUNT_TOO_LARGE", "Amount exceeds maximum allowed", req)
    );
  }

  // ─────────── 2) Validate idempotency key ───────────
  // Header tồn tại nhưng rỗng → 400 (đúng RFC draft idempotency-key)
  if (rawKey !== undefined && idempotencyKey === "") {
    return res.status(400).json(
      error("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key header must not be empty", req)
    );
  }
  if (idempotencyKey && idempotencyKey.length > 255) {
    return res.status(400).json(
      error("INVALID_IDEMPOTENCY_KEY", "Idempotency-Key exceeds 255 chars", req)
    );
  }

  // ─────────── 3) Business call ───────────
  try {
    const policy = await service.topUp(id, amount, idempotencyKey || null);

    if (!policy) {
      return res.status(404).json(
        error("NOT_FOUND", "Policy not found", req)
      );
    }

    // Echo lại key để client biết server đã chấp nhận
    if (idempotencyKey) {
      res.set("Idempotency-Key", idempotencyKey);
    }

    // ETag cho concurrency control
    res.set("ETag", `W/"${policy.id}-v${policy.version}"`);

    // ✅ 200 OK (không phải 201)
    return res.status(200).json(mapResponse(policy, req));
  } catch (err) {
    // ─── Map domain errors → HTTP ───
    switch (err.code) {
      case "IN_FLIGHT":
        return res
          .status(409)
          .set("Retry-After", "2")
          .json(error("IN_FLIGHT", "Request is still processing", req, { retryAfter: 2 }));

      case "DUPLICATE_REQUEST":
        // Replay với cùng key nhưng khác payload → conflict thật sự
        return res
          .status(409)
          .json(error("DUPLICATE_REQUEST", "Idempotency key reused with different payload", req));

      case "INSUFFICIENT_BALANCE":
        return res.status(422).json(
          error("INSUFFICIENT_BALANCE", "Account balance is not sufficient", req)
        );

      case "POLICY_INACTIVE":
        return res.status(422).json(
          error("POLICY_INACTIVE", "Cannot top-up an inactive policy", req)
        );

      default:
        console.error("❌ Unexpected top-up error:", err);
        return next(err); // → global error handler → 500
    }
  }
};

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