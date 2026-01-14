# PWA Voice Assist

Browser-based voice satellite for Home Assistant. Use your PC, Tablet, or Phone as a fully functional voice assistant.

## Architecture
1. **Frontend (PWA)**: Detects Wake Word locally in the browser (using ONNX models).
2. **Backend (Python)**: Acts as a bridge between the Browser (WebSocket) and Home Assistant (**Wyoming Protocol**).
3. **Home Assistant**: Receives the wake event and starts the Assist Pipeline (STT -> Intent -> TTS).

## Features
- **Wyoming Protocol**: Native integration with HA (auto-discovery coming soon, manual config supported).
- **Offline PWA**: Installable app with Service Worker caching.
- **Privacy First**: Wake word runs 100% locally on your device.

## 🚀 Quick Start

### Option A: Docker (Recommended for Raspberry Pi)
1. **Run**:
   ```bash
   chmod +x run-pwa-voice-assistant.sh
   ./run-pwa-voice-assistant.sh
   # Or manually: docker-compose up -d --build
   ```
2. **Open**: `https://<RASPBERRY_IP>:8765`
3. **Connect HA**: In Home Assistant, the satellite should appear via Wyoming (port 10400).

### Option B: Native Python (venv)
1. **Setup**:
    ```bash
    git clone https://github.com/emme99/pwa-voice-assistant.git
    cd pwa-voice-assistant
    python3 -m venv venv
    source venv/bin/activate
    pip install -r server/requirements.txt
    ```
2. **Run**:
    ```bash
    python3 server/main.py
    ```
**Default Ports**:
- **8765**: WebSocket (Secure PWA Client)
- **10400**: Wyoming Protocol (Home Assistant Satellite)

### 3. Usage
1.  Open Chrome/Edge on your device.
2.  Navigate to `https://<YOUR_SERVER_IP>:8765`
3.  Accept the self-signed certificate (if using default SSL).
4.  Click **"Install App"** in the address bar to install as PWA.
5.  Say **"Alexa"** (or select another wake word) to command Home Assistant!

## 🐳 Docker (Raspberry Pi)
A Docker container is provided for easy deployment on Raspberry Pi alongside Home Assistant.
See `docker-compose.yml` for details.

## ⚙️ Configuration
Copy `server/config.example.yaml` to `server/config.yaml` to customize:
- `enable_tcp`: Enable legacy ESPHome TCP protocol (default: `false`).
- `ssl`: Enable HTTPS (required for mic on mobile if not localhost).

## 🔒 HTTPS / SSL
To use the microphone on other devices (not localhost), you **must** use HTTPS.
1. Generate certificates (self-signed or Let's Encrypt).
2. Place `cert.pem` and `key.pem` in the `client/` folder.
3. Restart the server.

## License
MIT License
