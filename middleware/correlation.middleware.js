const { v4: uuidv4 } = require('uuid');

exports.correlationId = (req, res, next) => {
  req.correlationId = uuidv4();
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
};