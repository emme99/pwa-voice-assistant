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
  
  
## Limitations and Possible Solutions

### Overview
This project leverages a Progressive Web App (PWA) for a zero-hardware voice assistant integrated with Home Assistant via Wyoming. While innovative and privacy-focused, it has inherent limitations due to browser and Android constraints, particularly with always-on wake word (WW) detection. Below is a summary of key limitations and recommended solutions, based on analysis of stability issues (e.g., initial detection works but fails over time) and alternatives for improved reliability.

### Key Limitations
- **Wake Word Detection Instability**: Initial detections are reliable, but the system often fails after a few minutes due to browser hibernation, background throttling on Android/Chrome, microphone permission revocation, or resource overload from ONNX/WASM processing. This is not a code bug but a platform limitation—Android prioritizes battery saving, suspending JS/WASM loops and audio access in background tabs.
- **Background Execution Challenges**: PWAs struggle with continuous listening when the app is minimized or the screen is off, leading to dropped connections or frozen detection. This makes it less suitable for "always-on" use compared to dedicated hardware.
- **Browser Dependencies**: Relies on HTTPS for microphone access, with potential WebSocket disconnects and no native-level control over permissions or resources. Performance may degrade on low-end tablets.
- **Project Maturity**: As an early-stage project (limited commits), it lacks advanced features like multi-WW support or robust error handling, though rapid iterations are ongoing.

### Possible Solutions
- **Optimize PWA for Stability**:
  - Disable battery optimization for Chrome on Android (Settings > Apps > Chrome > Battery > Unrestricted) to reduce throttling.
  - Keep the PWA in foreground or with the screen always on for testing/production use.
  - Implement WebSocket reconnect with exponential backoff, visibility change handlers (e.g., pause/resume on `visibilitychange`), and detailed client-side logging for debugging.
  - Use remote DevTools (chrome://inspect) to monitor errors like "AudioContext suspended" or WebSocket issues.

- **Switch to Kiosk Mode Apps (Recommended for Quick Wins)**:
  - Adopt apps like **Fully Kiosk Browser** (free trial, ~€10-20 for Plus features) to load your PWA URL (e.g., https://your-pi:8765/overlay.html). It enables persistent microphone access, ignores battery optimizations, and supports kiosk features like fullscreen lock, hidden bars, and acoustic motion detection.
    - Setup: Install from Play Store, set start URL, enable microphone (Plus), and configure device management for keep-alive.
  - Alternatives: **WallPanel** (open-source, free with motion/face detection) or enterprise MDM like Scalefusion/Hexnode for similar benefits.
  - Benefits: Resolves most instability without code changes; ideal for wall-mounted tablets and easy sharing with non-technical users.

- **Develop a Custom Android App with WebView**:
  - For maximum control, build a simple APK using Android Studio (Kotlin/Java) that embeds a WebView to load your PWA.
  - Add a Foreground Service with partial wake locks and persistent mic permissions to ensure always-on detection.
  - Integrate native WW libraries like Picovoice/Porcupine for better stability (replacing WASM).
  - Drawbacks: More development effort and sideload distribution (not Play Store-friendly), but lightweight (~10-30MB bundle).

- **Hardware or Hybrid Alternatives**:
  - For production reliability, consider dedicated satellites (e.g., ESP32-S3, ReSpeaker) with Wyoming, or hybrid setups (PWA for UI + hardware for audio).
  - Document these in your README and continue testing foreground stability— if resolved with optimizations, the PWA remains viable for personal use.

This approach balances accessibility with reliability. For contributions or issues, check the repository for updates.

**AI Assistance Disclaimer**: Parts of this code were generated or assisted
by AI models (including Grok by xAI). All code has been manually reviewed
and tested.