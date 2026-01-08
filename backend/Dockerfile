# ZK-IMG Backend Dockerfile
FROM node:18-alpine

# Install system dependencies for image processing and ZK proofs
RUN apk add --no-cache \
    python3 \
    make \
    g++ \
    git \
    curl \
    && rm -rf /var/cache/apk/*

# Install Circom compiler globally
RUN npm install -g circom@latest

# Create app directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install Node.js dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy application code
COPY . .

# Create necessary directories
RUN mkdir -p uploads zk/artifacts zk/proofs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:3000/test || exit 1

# Start the application
CMD ["npm", "start"]
