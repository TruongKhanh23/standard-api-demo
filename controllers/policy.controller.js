const service = require("../services/policy.service");
const { createPolicy } = require("../models/policy.model");

exports.getAll = (req, res) => {
  console.log("GET ALL | req.query: ", req.query);
  const result = service.getAll(req.query);
  res.json(result);
};

exports.getById = (req, res) => {
  const policy = service.getById(req.params.id);

  if (!policy) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  // ✅ ADD THIS
  res.setHeader("ETag", policy.version.toString());

  res.json(policy);
};

exports.create = (req, res) => {
  const { policyNumber, premiumAmount, currency } = req.body;

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
    const policy = createPolicy(req.body);
    service.create(policy);
    res.status(201).json(policy);
  } catch (err) {
    return res
      .status(400)
      .json(error("DUPLICATE", "Policy already exists", req));
  }
};

exports.update = (req, res) => {
  console.log("➡️ Controller: PUT policy", req.params.id);

  const existing = service.getById(req.params.id);
  if (!existing) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  // ✅ ✅ CHECK IF-MATCH
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

  // ✅ Validate full object
  const { policyNumber, premiumAmount, currency } = req.body;

  if (!policyNumber || !premiumAmount || !currency) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Full resource required", req));
  }

  const policy = service.update(req.params.id, req.body);

  res.setHeader("ETag", policy.version.toString());

  res.json(policy);
};

exports.patch = (req, res) => {
  console.log("➡️ Controller: PATCH policy", req.params.id);

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

  res.json(policy);
};

exports.topUp = (req, res) => {
  console.log("➡️ Controller: TOP-UP", req.params.id);

  const { amount } = req.body;

  if (!amount || isNaN(amount) || amount <= 0) {
    return res
      .status(400)
      .json(error("INVALID_REQUEST", "Amount must be positive number", req));
  }

  const policy = service.topUp(req.params.id, amount);

  if (!policy) {
    return res.status(404).json(error("NOT_FOUND", "Policy not found", req));
  }

  res.json(policy);
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

  res.json(policy);
};

function error(code, message, req) {
  return {
    code,
    message,
    correlationId: req.correlationId,
  };
}
