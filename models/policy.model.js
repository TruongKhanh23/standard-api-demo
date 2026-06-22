const { v4: uuidv4 } = require('uuid');

exports.createPolicy = (data) => ({
  policyNumber: data.policyNumber,
  premiumAmount: parseInt(data.premiumAmount),
  currency: data.currency,
  status: "ACTIVE",
});