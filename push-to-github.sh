#!/bin/bash
echo "🚀 Pushing to GitHub..."
echo ""

# Configure git (optional but helpful)
git config --global user.name "OE-GOD"
git config --global user.email "your-email@example.com"

# Push to GitHub
git push -u origin main

echo ""
if [ $? -eq 0 ]; then
    echo "✅ SUCCESS! Your code is on GitHub!"
    echo "🌐 View at: https://github.com/OE-GOD/rial"
else
    echo "❌ Push failed. You may need to authenticate."
    echo ""
    echo "Try this:"
    echo "1. Go to: https://github.com/settings/tokens"
    echo "2. Generate new token with 'repo' permission"
    echo "3. Run: git push -u https://TOKEN@github.com/OE-GOD/rial.git main"
fi
