#!/bin/bash

# Start public tunnel for ZK-IMG backend using localhost.run
# No signup required!

echo "🚀 Starting public tunnel for ZK-IMG backend..."
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📡 Creating public tunnel to localhost:3000..."
echo "   This will give you a public HTTPS URL that works on any device"
echo "   No local network permission needed!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔗 Your public URL will appear below:"
echo "   Copy the URL (e.g., https://abc123.lhr.life)"
echo "   Paste it in your iPhone app's Backend URL setting"
echo ""
echo "Press Ctrl+C to stop the tunnel"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Use localhost.run - no signup required!
ssh -R 80:localhost:3000 nokey@localhost.run
