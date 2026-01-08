#!/bin/bash

echo "🔍 Finding your Cloudflare tunnel URL..."
echo ""

# Method 1: Check recent logs
if command -v lsof &> /dev/null; then
    echo "Checking active connections..."
    TUNNEL_URL=$(lsof -i :3000 -n -P | grep cloudflared | head -1 | awk '{print $10}' | sed 's/:3000//')
fi

# Method 2: Check process output
if [ -z "$TUNNEL_URL" ]; then
    echo "Checking cloudflared output..."
    # Look for recent cloudflared output in system logs
    TUNNEL_URL=$(ps aux | grep "cloudflared tunnel" | grep -v grep | head -1 | awk -F'--url ' '{print $2}' | awk '{print $1}')
fi

# Method 3: Try to establish connection and check response
if [ -z "$TUNNEL_URL" ]; then
    echo "Testing local cloudflared..."
    # Cloudflared usually outputs the URL to stderr when starting
    echo "Please check the terminal where you ran cloudflared tunnel"
    echo "Look for a line like: https://xxx.trycloudflare.com"
fi

# If we found something, display it
if [ ! -z "$TUNNEL_URL" ]; then
    echo "📡 Found tunnel URL: $TUNNEL_URL"
else
    echo ""
    echo "⚠️  Could not automatically detect tunnel URL"
    echo ""
    echo "Please check the terminal where you ran:"
    echo "  cloudflared tunnel --url http://localhost:3000"
    echo ""
    echo "You should see output like:"
    echo "  +--------------------------------------------------------------------------------------------+"
    echo "  |  Your quick Tunnel has been created! Visit it at:                                         |"
    echo "  |  https://example-name-here.trycloudflare.com                                              |"
    echo "  +--------------------------------------------------------------------------------------------+"
    echo ""
    echo "Copy that URL and use it in your app!"
fi
