const { v4: uuidv4 } = require("uuid");

let policies = [
  {
    id: uuidv4(),
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
    id: uuidv4(),
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

  policies.push(policy);
  return policy;
};

exports.update = (id, data) => {
  console.log("🔧 Service: PUT update policy", id);

  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const existing = policies[index];

  policies[index] = {
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
  console.log("🔧 Service: PATCH policy", id);
  console.log("Partial Data:", partialData);

  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return null;

  // merge dữ liệu (partial update)
  policies[index] = {
    ...policies[index],
    ...partialData,
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

exports.topUp = (id, amount) => {
  console.log("🔧 Service: TOP-UP", id, amount);

  const policy = policies.find((p) => p.id === id);
  if (!policy) return null;

  // 🔥 Business logic (KHÔNG idempotent!)
  policy.accountBalance = (policy.accountBalance || 0) + amount;

  policy.updatedAt = new Date().toISOString();
  policy.version += 1;

  // simulate side effect
  console.log(`💰 Added ${amount} to balance`);
  console.log(`📡 Notify billing system`);

  return policy;
};
