#!/bin/bash

# Start ngrok tunnel for ZK-IMG backend
# This creates a public URL that bypasses iOS local network restrictions

echo "🚀 Starting ngrok tunnel for ZK-IMG backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Check if ngrok is installed
if ! command -v ngrok &> /dev/null; then
    echo "❌ ngrok is not installed. Installing now..."
    
    # Install ngrok via homebrew
    if command -v brew &> /dev/null; then
        brew install ngrok/ngrok/ngrok
    else
        echo "❌ Homebrew not found. Please install ngrok manually:"
        echo "   Visit: https://ngrok.com/download"
        exit 1
    fi
fi

# Start the tunnel
echo "📡 Starting public tunnel to localhost:3000..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Your public URL will appear below:"
echo "   Copy the HTTPS URL (e.g., https://abc123.ngrok.io)"
echo "   Paste it in your iPhone app's Backend URL setting"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

# Run ngrok
ngrok http 3000
