const { v4: uuidv4 } = require("uuid");
const processedTransactions = new Map();

const generatePolicyId = () => {
  return "pol_" + uuidv4().replace(/-/g, "").slice(0, 12);
};

let internalCounter = 1;

let policies = [
  {
    internalId: internalCounter++,
    id: generatePolicyId(),
    policyNumber: "P-001",
    premiumAmount: 1000000,
    accountBalance: 1000000,
    currency: "VND",
    status: "ACTIVE",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    internalId: internalCounter++,
    id: generatePolicyId(),
    policyNumber: "P-002",
    premiumAmount: 2000000,
    accountBalance: 1000000,
    currency: "USD",
    status: "INACTIVE",
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

exports.getAll = (query) => {
  let result = [...policies];

  // Filter by status
  if (query.status) {
    result = result.filter((p) => p.status === query.status);
  }

  // Pagination
  const page = parseInt(query.page) || 1;
  const size = parseInt(query.size) || 10;

  const start = (page - 1) * size;
  const end = start + size;

  return {
    data: result.slice(start, end),
    pagination: {
      page,
      size,
      total: result.length,
    },
  };
};

exports.getById = (id) => policies.find((p) => p.id === id);

exports.create = (policy) => {
  const exists = policies.find((p) => p.policyNumber === policy.policyNumber);
  if (exists) {
    throw new Error("DUPLICATE_POLICY");
  }

  const newPolicy = {
    ...policy,
    internalId: internalCounter++,
    id: generatePolicyId(),
    version: 1,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  policies.push(newPolicy);
  return newPolicy;
};

exports.update = (id, data) => {
  console.log("🔧 Service: PUT update policy", id);

  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const existing = policies[index];

  policies[index] = {
    internalId: existing.internalId,
    id: existing.id,
    createdAt: existing.createdAt,

    policyNumber: data.policyNumber,
    premiumAmount: parseInt(data.premiumAmount),
    currency: data.currency,
    status: data.status || "ACTIVE",

    version: existing.version + 1,
    updatedAt: new Date().toISOString(),
  };

  return policies[index];
};

exports.patch = (id, partialData) => {
  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const allowedFields = ["premiumAmount", "currency", "status"];

  const sanitized = {};

  for (const key of allowedFields) {
    if (partialData[key] !== undefined) {
      sanitized[key] = partialData[key];
    }
  }

  policies[index] = {
    ...policies[index],
    ...sanitized,
    version: policies[index].version + 1,
    updatedAt: new Date().toISOString(),
  };

  return policies[index];
};

exports.delete = (id) => {
  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return false;

  policies.splice(index, 1);
  return true;
};

exports.topUp = async (id, amount, idempotencyKey) => {
  console.log("🔧 Service: TOP-UP", id, amount);
  await new Promise(r => setTimeout(r, 2000));
  if (idempotencyKey && processedTransactions.has(idempotencyKey)) {
    console.log("🔁 Duplicate business execution prevented");
    return processedTransactions.get(idempotencyKey);
  }

  const policy = policies.find((p) => p.id === id);
  if (!policy) return null;

  // business execution
  policy.accountBalance = (policy.accountBalance || 0) + amount;

  policy.updatedAt = new Date().toISOString();
  policy.version += 1;

  const result = { ...policy };

  // store result
  if (idempotencyKey) {
    processedTransactions.set(idempotencyKey, result);
  }

  console.log(`💰 Added ${amount} to balance`);
  console.log(`📡 Notify billing system`);

  return result;
};
