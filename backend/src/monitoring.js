/**
 * Monitoring and observability for ZK-IMG backend
 * Provides metrics, logging, and health checks
 */

const promClient = require('prom-client');
const winston = require('winston');
const { models } = require('./database');

// Prometheus metrics registry
const register = new promClient.Registry();

// Add default metrics (CPU, memory, etc.)
promClient.collectDefaultMetrics({ register });

// Custom metrics
const httpRequestDuration = new promClient.Histogram({
  name: 'http_request_duration_seconds',
  help: 'Duration of HTTP requests in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.1, 0.5, 1, 2, 5, 10]
});

const zkProofGenerationDuration = new promClient.Histogram({
  name: 'zk_img_proof_generation_duration_seconds',
  help: 'Duration of ZK proof generation in seconds',
  labelNames: ['proving_system', 'circuit_type'],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10]
});

const zkProofsGenerated = new promClient.Counter({
  name: 'zk_img_proofs_generated_total',
  help: 'Total number of ZK proofs generated',
  labelNames: ['proving_system', 'circuit_type']
});

const imagesProcessed = new promClient.Counter({
  name: 'zk_img_images_processed_total',
  help: 'Total number of images processed',
  labelNames: ['has_transformations', 'has_zk_proofs']
});

const fraudDetected = new promClient.Counter({
  name: 'zk_img_fraud_detected_total',
  help: 'Total number of fraud events detected',
  labelNames: ['fraud_type', 'confidence_level']
});

const activeConnections = new promClient.Gauge({
  name: 'zk_img_active_connections',
  help: 'Number of active connections'
});

const memoryUsage = new promClient.Gauge({
  name: 'zk_img_memory_usage_bytes',
  help: 'Memory usage in bytes',
  labelNames: ['type']
});

// Winston logger configuration
const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'zk-img-backend' },
  transports: [
    // Write all logs with importance level of `error` or less to `error.log`
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }),
    // Write all logs with importance level of `info` or less to `combined.log`
    new winston.transports.File({ filename: 'logs/combined.log' }),
  ],
});

// If we're not in production then log to the console with a simple format
if (process.env.NODE_ENV !== 'production') {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple()
    )
  }));
}

// Create logs directory
const fs = require('fs');
if (!fs.existsSync('logs')) {
  fs.mkdirSync('logs');
}

// Monitoring middleware
function monitoringMiddleware(req, res, next) {
  const start = Date.now();
  activeConnections.inc();

  // Track response
  res.on('finish', async () => {
    const duration = (Date.now() - start) / 1000;

    // Record HTTP metrics
    httpRequestDuration
      .labels(req.method, req.route?.path || req.path, res.statusCode.toString())
      .observe(duration);

    // Record memory usage
    const memUsage = process.memoryUsage();
    memoryUsage.labels('rss').set(memUsage.rss);
    memoryUsage.labels('heap_used').set(memUsage.heapUsed);
    memoryUsage.labels('heap_total').set(memUsage.heapTotal);

    // Log to database if available
    if (models.APIUsage) {
      try {
        const apiUsage = new models.APIUsage();
        await apiUsage.logRequest(req, res, duration * 1000);
      } catch (error) {
        logger.error('Failed to log API usage', { error: error.message });
      }
    }

    activeConnections.dec();
  });

  next();
}

// ZK proof monitoring
async function recordZKProofMetrics(provingSystem, circuitType, duration, success = true) {
  if (success) {
    zkProofsGenerated.labels(provingSystem, circuitType).inc();
  }

  zkProofGenerationDuration
    .labels(provingSystem, circuitType)
    .observe(duration);

  // Record to database
  if (models.SystemMetrics) {
    try {
      const systemMetrics = new models.SystemMetrics();
      await systemMetrics.recordMetric(
        'zk_proof_generation_time',
        duration,
        'seconds',
        { proving_system: provingSystem, circuit_type: circuitType, success }
      );
    } catch (error) {
      logger.error('Failed to record ZK proof metrics', { error: error.message });
    }
  }

  logger.info('ZK proof generated', {
    proving_system: provingSystem,
    circuit_type: circuitType,
    duration_seconds: duration,
    success
  });
}

// Image processing monitoring
async function recordImageProcessing(hasTransformations, hasZKProofs) {
  imagesProcessed.labels(
    hasTransformations.toString(),
    hasZKProofs.toString()
  ).inc();

  // Record to database
  if (models.SystemMetrics) {
    try {
      const systemMetrics = new models.SystemMetrics();
      await systemMetrics.recordMetric(
        'images_processed',
        1,
        'count',
        { has_transformations: hasTransformations, has_zk_proofs: hasZKProofs }
      );
    } catch (error) {
      logger.error('Failed to record image processing metrics', { error: error.message });
    }
  }
}

// Fraud detection monitoring
async function recordFraudDetection(fraudType, confidence) {
  const confidenceLevel = confidence >= 0.8 ? 'high' : confidence >= 0.5 ? 'medium' : 'low';
  fraudDetected.labels(fraudType, confidenceLevel).inc();

  // Record to database
  if (models.FraudEvents) {
    try {
      const fraudEvents = new models.FraudEvents();
      await fraudEvents.reportFraud(null, fraudType, confidence, 'automated_detection', {
        confidence_level: confidenceLevel,
        source: 'api'
      });
    } catch (error) {
      logger.error('Failed to record fraud detection', { error: error.message });
    }
  }

  logger.warn('Fraud detected', {
    fraud_type: fraudType,
    confidence,
    confidence_level: confidenceLevel
  });
}

// Health check endpoint
function healthCheck(req, res) {
  // Check database connectivity
  const dbHealthy = models.CertifiedImages ? true : false;

  // Check Redis connectivity
  const redisHealthy = true; // Assume healthy for now

  // Check system resources
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();

  const health = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || '1.0.0',
    uptime: process.uptime(),
    database: dbHealthy ? 'healthy' : 'unhealthy',
    redis: redisHealthy ? 'healthy' : 'unhealthy',
    memory: {
      rss: memUsage.rss,
      heap_used: memUsage.heapUsed,
      heap_total: memUsage.heapTotal,
      external: memUsage.external
    },
    cpu: cpuUsage,
    environment: process.env.NODE_ENV || 'development'
  };

  const statusCode = (dbHealthy && redisHealthy) ? 200 : 503;
  res.status(statusCode).json(health);
}

// Metrics endpoint for Prometheus
function metricsEndpoint(req, res) {
  res.set('Content-Type', register.contentType);
  register.metrics().then(metrics => {
    res.end(metrics);
  }).catch(error => {
    logger.error('Failed to generate metrics', { error: error.message });
    res.status(500).end();
  });
}

// Error handling middleware
function errorHandler(err, req, res, next) {
  logger.error('Unhandled error', {
    error: err.message,
    stack: err.stack,
    url: req.url,
    method: req.method,
    ip: req.ip
  });

  // Record error metric
  if (models.SystemMetrics) {
    try {
      const systemMetrics = new models.SystemMetrics();
      systemMetrics.recordMetric('errors_total', 1, 'count', {
        type: 'unhandled',
        endpoint: req.path,
        method: req.method
      });
    } catch (metricError) {
      logger.error('Failed to record error metric', { error: metricError.message });
    }
  }

  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
}

// Graceful shutdown
function gracefulShutdown(signal) {
  logger.info(`Received ${signal}, shutting down gracefully`);

  // Close database connections
  if (global.dbPool) {
    global.dbPool.end();
  }

  if (global.redisClient) {
    global.redisClient.disconnect();
  }

  process.exit(0);
}

// Setup signal handlers
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

module.exports = {
  logger,
  monitoringMiddleware,
  recordZKProofMetrics,
  recordImageProcessing,
  recordFraudDetection,
  healthCheck,
  metricsEndpoint,
  errorHandler,
  register
};
