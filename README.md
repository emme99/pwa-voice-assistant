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

## 🔒 HTTPS vs HTTP (Insecure Origins)
To use the microphone on other devices (not localhost), browsers normally **require HTTPS**. 
However, for a local Home Lab setup, you can bypass this:

### Option 1: Proper SSL (Recommended)
1. Generate certificates (self-signed or Let's Encrypt).
2. Place `cert.pem` and `key.pem` in the `client/` folder.
3. Restart the server.

### Option 2: Allow HTTP (Insecure Origins)
If you don't want to deal with SSL certificates, you can configure your browser to treat your local IP as "secure".

1. Open Chrome/Edge or any Chromium browser.
2. Navigate to: `chrome://flags/#unsafely-treat-insecure-origin-as-secure`
3. **Enable** the flag.
4. In the text box, enter your server's URL, e.g.:
   `http://192.168.1.100:8765`
5. Relaunch the browser.
   
Now the Microphone and Service Worker will work over HTTP!

## 🖼️ Home Assistant Embedding (Iframe)
To add the PWA as a dashboard card (via Webpage card/iframe) over HTTP, you must relax Home Assistant's security settings.

1. Edit your `configuration.yaml` in Home Assistant:
   ```yaml
   http:
     use_x_frame_options: false
   ```
2. Restart Home Assistant.
   
**Note**: This allows Home Assistant to be embedded in other sites, or other sites (like PWA Voice Assist) to be embedded in Home Assistant.

## License
MIT License

## 🔋 Battery Optimization (Android)
To prevent the app from sleeping in the background (which stops wake word detection):
1. Go to **Settings > Apps > Chrome** (or your browser).
2. Tap **Battery**.
3. Set to **Unrestricted** (or "Don't optimize").
4. (Optional) Lock the app in the "Refent Apps" view so it isn't cleared by memory management.

## 🛠 Troubleshooting
- **Connection Lost**: The yellow/red status dot indicates a WebSocket issue. The app automatically attempts to reconnect (with exponential backoff).
- **Microphone**: If "Inactive" or "Denied", ensure the site is accessed via HTTPS (or localhost) and permissions are granted. The app will prompt you to retry if denied.
- **Wake Word Stops working**:
    - If on Android, check **Battery Optimization** settings above.
    - Check the **Debug Log** (toggle in settings overlay) for errors.
    - Ensure the WebSocket server is running.

