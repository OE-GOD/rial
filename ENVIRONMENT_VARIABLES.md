# ZK-IMG Environment Configuration

## Overview
ZK-IMG supports comprehensive configuration through environment variables for different deployment scenarios.

## Quick Setup

```bash
# Copy and customize
cp ENVIRONMENT_VARIABLES.md .env
# Edit .env with your values
```

## Server Configuration

```bash
# Basic server settings
NODE_ENV=development          # development | production
PORT=3000                     # Server port
HOST_IP=10.0.0.59            # IP for mobile access
```

## ZK Proof Configuration

```bash
# Proof system settings
USE_HALO2=true               # Use fast Halo2 proofs (recommended)
ZK_MAX_DIMENSION=2048        # Max image dimension for processing
ZK_PROOF_MAX_DIMENSION=128   # Max dimension for proof generation
```

## Database Configuration

```bash
# PostgreSQL settings
USE_DATABASE=true
DB_HOST=localhost
DB_PORT=5432
DB_NAME=zkimg
DB_USER=zkimg
DB_PASSWORD=your_secure_password

# Redis settings
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

## Security & Performance

```bash
# Rate limiting
RATE_LIMIT_WINDOW_MS=900000   # 15 minutes
RATE_LIMIT_MAX_REQUESTS=100   # Max requests per window

# File upload limits
MAX_FILE_SIZE_MB=50
MAX_FILES_COUNT=10

# Logging
LOG_LEVEL=info               # error | warn | info | debug
```

## Blockchain Integration (Optional)

```bash
# Polygon network
POLYGON_RPC_URL=https://polygon-rpc.com
PRIVATE_KEY=your_private_key
CONTRACT_ADDRESS=your_deployed_contract

# Batch processing
BATCH_INTERVAL_HOURS=1
BATCH_SIZE=100
```

## Production Tuning

```bash
# Memory and performance
NODE_OPTIONS="--max-old-space-size=4096"
UV_THREADPOOL_SIZE=8

# Monitoring
PROMETHEUS_ENABLED=true
HEALTH_CHECK_INTERVAL=30
```

## Feature Flags

```bash
# Enable/disable features
ENABLE_ADVANCED_TRANSFORMS=true
ENABLE_BATCH_PROCESSING=true
ENABLE_PWA_SUPPORT=false
ENABLE_CACHING=true
```

## Docker Configuration

```bash
# For docker-compose
COMPOSE_PROJECT_NAME=zk-img
DOCKER_NETWORK=zk-img-network
```

## Environment-Specific Examples

### Development
```bash
NODE_ENV=development
USE_DATABASE=false
LOG_LEVEL=debug
```

### Production with Docker
```bash
NODE_ENV=production
USE_DATABASE=true
DB_HOST=postgres
REDIS_HOST=redis
LOG_LEVEL=warn
PROMETHEUS_ENABLED=true
```

### High-Performance Setup
```bash
USE_HALO2=true
ZK_MAX_DIMENSION=4096
NODE_OPTIONS="--max-old-space-size=8192"
UV_THREADPOOL_SIZE=16
ENABLE_BATCH_PROCESSING=true
```

## Security Considerations

- **Never commit `.env` files** to version control
- **Use strong passwords** for database and Redis
- **Rotate keys regularly** for production deployments
- **Enable rate limiting** to prevent abuse
- **Use HTTPS** in production (configure with nginx)

## Monitoring Your Configuration

Check your configuration status:
```bash
curl http://localhost:3000/health
```

View metrics:
```bash
curl http://localhost:3000/metrics
```
