const express = require('express');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const authRoutes = require('./routes/auth.routes');
const policyRoutes = require('./routes/policy.routes');
const { errorHandler } = require('./middleware/error.middleware');
const { correlationId } = require('./middleware/correlation.middleware');

const swaggerUi = require('swagger-ui-express');
const YAML = require('yamljs');

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cors());
app.use(morgan('dev'));
app.use(correlationId);
app.use('/oauth', authRoutes);

// Rate limit
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 100
});
app.use(limiter);

// Swagger
const swaggerDoc = YAML.load('./swagger.yaml');
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc));

// Routes
app.use('/policies', policyRoutes);

// Error handler
app.use(errorHandler);

app.listen(3000, () => {
  console.log('API running on http://localhost:3000');
});