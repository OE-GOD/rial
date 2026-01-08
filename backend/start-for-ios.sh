#!/bin/bash
# Start backend for iOS testing

echo "🚀 Starting backend for iOS app..."
echo ""

# Kill any existing node processes
killall node 2>/dev/null
sleep 1

# Set environment
export USE_DATABASE=false
export PORT=3000
export NODE_ENV=development
export HOST=0.0.0.0

# Start server
cd "$(dirname "$0")"
node server.js 2>&1 | tee /tmp/backend-ios.log
