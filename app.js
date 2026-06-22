const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const policyRoutes = require('./routes/policy.routes');

const errorHandler = require('./middleware/error.middleware');
const { correlationId } = require('./middleware/correlation.middleware');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const OpenApiValidator = require('express-openapi-validator');

const app = express();

// BASIC
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(morgan('dev'));

// CUSTOM
app.use(correlationId);

// RATE LIMIT
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(limiter);

// ROUTES
app.use('/oauth', authRoutes);
app.use('/policies', policyRoutes);

// SWAGGER UI
const swaggerDoc = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// OPENAPI VALIDATOR (ĐÚNG)
app.use(
  OpenApiValidator.middleware({
    apiSpec: './swagger.yaml',
    validateResponses: true,
  })
);

// ERROR HANDLER
app.use(errorHandler);

// START
app.listen(3000, () => {
  console.log('API running on http://localhost:3000');
});