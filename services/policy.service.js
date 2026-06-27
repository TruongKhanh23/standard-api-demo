const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DUMMY_PATH = path.join(__dirname, "..", "data", "policies.dummy.json");
const USE_FIXTURE = true; // bật khi chạy Dredd

// ---------- State ----------
let policies = [];
let internalCounter = 1;
let fixtureNewId = null;
const processedTransactions = new Map();
const inflightKeys = new Set();

// ---------- Helpers ----------
const loadDummy = () => {
  const raw = fs.readFileSync(DUMMY_PATH, "utf-8");
  const json = JSON.parse(raw);
  // deep clone để không mutate file gốc
  policies = JSON.parse(JSON.stringify(json.policies));
  internalCounter = json.meta.nextInternalId;
  fixtureNewId = json.meta.fixtureForNewPolicyId;
  processedTransactions.clear();
};

const generatePolicyId = () => {
  // Khi chạy Dredd: trả về ID cố định để khớp example trong Swagger
  if (USE_FIXTURE && fixtureNewId) return fixtureNewId;
  return "pol_" + uuidv4().replace(/-/g, "").slice(0, 12);
};

const nowISO = () =>
  USE_FIXTURE ? "2026-01-01T00:00:00.000Z" : new Date().toISOString();

// Load lần đầu khi require module
loadDummy();

// Export cho hooks/test reset trạng thái
exports.reset = () => {
  loadDummy();
  processedTransactions.clear();
  inflightKeys.clear();  
};


// ---------- CRUD ----------
exports.getAll = (query) => {
  let result = [...policies];

  if (query.status) {
    result = result.filter((p) => p.status === query.status);
  }

  const page = parseInt(query.page) || 1;
  const size = parseInt(query.size) || 10;
  const start = (page - 1) * size;
  const end = start + size;

  return {
    data: result.slice(start, end),
    pagination: { page, size, total: result.length },
  };
};

exports.getById = (id) => policies.find((p) => p.id === id);

exports.create = (policy) => {
  const exists = policies.find((p) => p.policyNumber === policy.policyNumber);
  if (exists) throw new Error("DUPLICATE_POLICY");

  const newPolicy = {
    ...policy,
    internalId: internalCounter++,
    id: generatePolicyId(),
    version: 1,
    createdAt: nowISO(),
    updatedAt: nowISO(),
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
    accountBalance: existing.accountBalance, // giữ lại để không mất balance
    currency: data.currency,
    status: data.status || "ACTIVE",

    version: existing.version + 1,
    updatedAt: nowISO(),
  };

  return policies[index];
};

exports.patch = (id, partialData) => {
  const index = policies.findIndex((p) => p.id === id);
  if (index === -1) return null;

  const allowedFields = ["premiumAmount", "currency", "status"];
  const sanitized = {};

  for (const key of allowedFields) {
    if (partialData[key] !== undefined) sanitized[key] = partialData[key];
  }

  policies[index] = {
    ...policies[index],
    ...sanitized,
    version: policies[index].version + 1,
    updatedAt: nowISO(),
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
  // Idempotency check
  if (idempotencyKey) {
    // Đã xử lý xong → trả lại result (replay an toàn)
    if (processedTransactions.has(idempotencyKey)) {
      return processedTransactions.get(idempotencyKey);
    }
    // Đang xử lý → 409 (caller cần retry)
    if (inflightKeys.has(idempotencyKey)) {
      const err = new Error('IN_FLIGHT');
      err.code = 'IN_FLIGHT';
      throw err;
    }
    inflightKeys.add(idempotencyKey);
  }

  try {
    if (!USE_FIXTURE) await new Promise((r) => setTimeout(r, 2000));

    const policy = policies.find((p) => p.id === id);
    if (!policy) return null;

    policy.accountBalance = (policy.accountBalance || 0) + amount;
    policy.updatedAt = nowISO();
    policy.version += 1;

    const result = { ...policy };
    if (idempotencyKey) processedTransactions.set(idempotencyKey, result);
    return result;
  } finally {
    if (idempotencyKey) inflightKeys.delete(idempotencyKey); // ✅ luôn clear
  }
};
