#!/bin/bash
# Setup production database

echo "🗄️ Setting up production database..."
echo ""

# Check if .env exists
if [ ! -f .env ]; then
    echo "❌ .env file not found!"
    echo ""
    echo "Please create .env file:"
    echo "1. Copy .env.example to .env"
    echo "2. Go to: https://dashboard.render.com/d/dpg-d4cls2idbo4c73dbbis0-a"
    echo "3. Copy the Internal Database URL"
    echo "4. Paste it in .env as DATABASE_URL"
    echo ""
    exit 1
fi

# Load environment
source .env

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
    echo "❌ DATABASE_URL not set in .env"
    exit 1
fi

echo "✅ Found DATABASE_URL"
echo ""

# Check if psql is available
if ! command -v psql &> /dev/null; then
    echo "📦 Installing PostgreSQL client tools..."
    brew install libpq
    brew link --force libpq
fi

echo "🔗 Connecting to database..."
echo ""

# Run schema
psql "$DATABASE_URL" < ../db/production-schema.sql

if [ $? -eq 0 ]; then
    echo ""
    echo "✅ Database schema created successfully!"
    echo ""
    echo "Your production database is ready!"
    echo ""
    echo "Tables created:"
    echo "  • claims"
    echo "  • claim_photos"
    echo "  • users"
    echo "  • sessions"
    echo "  • api_keys"
    echo "  • audit_log"
    echo "  • fraud_detections"
    echo ""
    echo "Default users created:"
    echo "  • admin / ChangeMe123!"
    echo "  • adjuster1 / Adjuster123!"
    echo ""
    echo "🚀 Start backend with: npm start"
else
    echo ""
    echo "❌ Schema creation failed"
    echo "Check the error above"
fi
