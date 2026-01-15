# Developer Guide (README-DEV.md)

This document is intended for developers who want to contribute to the **PWA Voice Assistant** project. Here you will find an overview of the architecture, file structure, and instructions for the development setup.

## 📂 Project Structure

```
pwa-voice-assistant/
├── client/                     # Frontend (PWA)
│   ├── app.js                  # Main logic: WebSocket, UI, audio handling
│   ├── wake-word-processor.js  # AudioWorklet for audio processing and ONNX interference
│   ├── sw.js                   # Service Worker (caching and offline handling)
│   ├── styles.css              # CSS Styles
│   ├── index.html              # UI Entry point
│   ├── overlay.html            # Lightweight version for iframe/overlay
│   ├── models/                 # ONNX models for wake word detection
│   └── libs/                   # External libraries (onnxruntime-web)
│
├── server/                     # Backend (Python)
│   ├── main.py                 # Server entry point
│   ├── websocket_server.py     # WebSocket Server to communicate with PWA Client
│   ├── wyoming_server.py       # Wyoming Protocol Server to communicate with Home Assistant
│   ├── config.yaml             # Runtime configuration
│   └── requirements.txt        # Python dependencies
│
├── run-pwa-voice-assistant.sh  # Helper script for Docker startup
├── analyze_wav.py              # Utility script for debugging WAV audio files
└── README.md                   # End-user documentation
```

## 🏗 Architecture

The system acts as a "bridge" between the browser and Home Assistant:

1.  **Frontend (Client)**:
    *   Captures audio from the microphone.
    *   Performs Wake Word detection **locally** using `onnxruntime-web` (WebAssembly).
    *   When the wake word is detected, it sends raw audio (PCM 16-bit 16kHz) to the server via WebSocket.
    *   Receives audio streams (TTS) to play and status messages.

2.  **Backend (Server)**:
    *   **WebSocket Server** (`port 8765`): Receives commands and audio from the PWA.
    *   **Wyoming Server** (`port 10400`): Acts as a Wyoming "Satellite". Forwards audio to Home Assistant and receives TTS/STT commands from Home Assistant.
    *   Connects the two worlds: Wake Word Event (Client) -> Trigger Pipeline (HA).

## 🧩 Key Components

### Client (`client/`)
-   **`app.js`**: Manages the state machine (Idle, Listening, Processing). Handles automatic socket reconnection and the user interface.
-   **`wake-word-processor.js`**: Runs in a separate thread (AudioWorklet). Accumulates audio buffers, calculates features (Melspectrogram), and sends tensors to the ONNX model.
-   **`sw.js`**: Cache-first strategy to enable offline functionality and reduce loading times.

### Server (`server/`)
-   **`wyoming_server.py`**: Implements the Wyoming protocol specifications. Handles events like `run-pipeline`, `audio-start`, `audio-chunk`.
-   **`websocket_server.py`**: Handles multiple connections from browser clients. Forwards binary audio chunks directly to the Wyoming server.

## 🛠 Local Development

### Prerequisites
-   Python 3.9+
-   Node.js (optional, only for model conversion or managing npm packages if introduced)

### Setup

1.  **Clone the repo**:
    ```bash
    git clone https://github.com/emme99/pwa-voice-assistant.git
    cd pwa-voice-assistant
    ```

2.  **Server**:
    Create a virtual environment and install dependencies:
    ```bash
    python3 -m venv venv
    source venv/bin/activate
    pip install -r server/requirements.txt
    ```

3.  **Configuration**:
    Copy the example file:
    ```bash
    cp server/config.example.yaml server/config.yaml
    ```

4.  **Start**:
    ```bash
    python3 server/main.py
    ```
    The server will listen on `0.0.0.0:8765` (WS) and `0.0.0.0:10400` (Wyoming).

5.  **Client**:
    No build needed! The Python server directly serves the `client/` folder.
    Open your browser at: `http://localhost:8765`

## 🐛 Debugging

-   **Client**: Use Chrome DevTools (Console). Click 5 times on the "Connected" status in the UI to perform an on-screen debug log.
-   **Server**: Logs are printed to stdout. Set `logging.level: DEBUG` in `config.yaml` for more verbosity.
-   **Audio**: Use `analyze_wav.py` to inspect `.wav` files saved in the `server/` folder if audio dump is enabled.

## 🤝 Contributing

Feel free to open Issues or Pull Requests. For substantial architecture changes, please open a discussion first.
