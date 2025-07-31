#!/bin/bash

# Fly.io deployment script for GameShare signaling server

echo "🚀 Deploying GameShare signaling server to Fly.io..."

# Check if flyctl is installed
if ! command -v flyctl &> /dev/null; then
    echo "❌ flyctl is not installed. Please install it first:"
    echo "   curl -L https://fly.io/install.sh | sh"
    exit 1
fi

# Check if user is logged in
if ! flyctl auth whoami &> /dev/null; then
    echo "🔐 Please log in to Fly.io:"
    flyctl auth login
fi

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Deploy to Fly.io
echo "🚀 Deploying to Fly.io..."
flyctl deploy

echo "✅ Deployment complete!"
echo "📊 Monitor your app with:"
echo "   flyctl status"
echo "   flyctl logs"
echo "   flyctl metrics" 