#!/bin/bash
# Quick setup script for PWA Voice Assistant

set -e

echo "🎙️ PWA Voice Assistant - Quick Setup"
echo "====================================="
echo

# Check Python version
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 not found. Please install Python 3.11 or higher."
    exit 1
fi

PYTHON_VERSION=$(python3 --version | cut -d' ' -f2 | cut -d'.' -f1-2)
echo "✓ Found Python $PYTHON_VERSION"

# Setup virtual environment
echo
echo "📦 Setting up environment..."

if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv venv
fi

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies..."
pip install --quiet --upgrade pip
if [ -f "server/requirements.txt" ]; then
    pip install --quiet -r server/requirements.txt
    echo "✓ Dependencies installed"
else
    echo "⚠️ server/requirements.txt not found."
fi

# Create config from example
if [ ! -f "server/config.yaml" ]; then
    echo "Creating server/config.yaml from example..."
    cp server/config.example.yaml server/config.yaml
    echo "✓ Config created"
    echo
    echo "⚠️  Please edit server/config.yaml with your Home Assistant details:"
    echo "   - auth_token: If you set an auth token"
    echo "   - client.overlay_url: URL of your dashboard"
    echo
fi

echo "🌐 HTTPS/SSL Setup"
echo "Microphone access typically requires HTTPS (or localhost)."
if [ ! -f "client/cert.pem" ]; then
    echo "Would you like to generate self-signed certificates for HTTPS? (yes/no)"
    read -r response
    if [ "$response" = "yes" ]; then
        openssl req -x509 -newkey rsa:4096 -keyout client/key.pem \
            -out client/cert.pem -days 365 -nodes \
            -subj "/C=US/ST=State/L=City/O=PWA Voice Assist/CN=localhost"
        echo "✓ Self-signed certificates created in client/ folder"
        echo "⚠️  Remember to set ssl: true in server/config.yaml!"
    fi
fi

echo
echo "✅ Setup complete!"
echo
echo "📝 Next steps:"
echo "1. Edit server/config.yaml (if needed)"
echo "2. Start the server:"
echo "   source venv/bin/activate"
echo "   python3 server/main.py"
echo "3. Open the client in your browser:"
echo "   https://<YOUR_IP>:8765"
echo
