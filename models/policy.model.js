const { v4: uuidv4 } = require('uuid');

exports.createPolicy = (data) => ({
  id: uuidv4(),
  policyNumber: data.policyNumber,
  premiumAmount: parseInt(data.premiumAmount),
  currency: data.currency,
  status: "ACTIVE",
  version: 1,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
});