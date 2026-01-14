/**
 * Hybrid Voice Satellite Client
 * Browser-based voice control with wake word detection
 */

// Configuration
const CONFIG = {
    // Dynamically determine WebSocket URL based on current location if not stored
    wsUrl: localStorage.getItem('wsUrl') || 
           ((window.location.protocol === 'https:' ? 'wss://' : 'ws://') + window.location.host),
    wakeWord: localStorage.getItem('wakeWord') || 'alexa_v0.1',
    authToken: localStorage.getItem('authToken') || '',
    overlayUrl: localStorage.getItem('overlayUrl') || '',
    sampleRate: 16000,
    ttsSampleRate: 22050,
    channels: 1,
    pingIntervalMs: 20000,
    pongTimeoutMs: 5000
};

// ONNX Runtime Web Configuration
if (window.ort) {
    ort.env.wasm.wasmPaths = '/libs/'; 
    // ort.env.wasm.numThreads = 1; 
}

// Application state
const STATE = {
    ws: null,
    audioContext: null,
    mediaStream: null,
    audioWorkletNode: null,
    isActive: false,
    isListening: false,
    reconnectAttempts: 0,
    maxReconnectAttempts: 10, // Increased cap
    reconnectTimer: null,
    pingInterval: null,
    pongTimeout: null,
    isReconnecting: false,
    onnxSessions: {
        mel: null,
        embedding: null,
        wakeWord: null
    },
    buffers: {
        mel: [], 
        emb: new Array(16).fill(0).map(() => new Float32Array(96).fill(0)) 
    },
    lastError: null,
    isInferencing: false,
    silenceTimer: null
};

// DOM Elements
const elements = {
    activateBtn: document.getElementById('activate-btn'),
    settingsBtn: document.getElementById('settings-btn'),
    installBtn: document.getElementById('install-btn'),
    settingsPanel: document.getElementById('settings-panel'),
    saveSettings: document.getElementById('save-settings'),
    clearLogBtn: document.getElementById('clear-log-btn'),
    wsStatus: document.getElementById('ws-status'),
    wyomingStatus: document.getElementById('wyoming-status'),
    micStatus: document.getElementById('mic-status'),
    stateText: document.getElementById('state-text'),
    micVisualizer: document.getElementById('mic-visualizer'),
    debugLog: document.getElementById('debug-log'),
    wsUrlInput: document.getElementById('ws-url'),
    wakeWordSelect: document.getElementById('wake-word-select'),
    authTokenInput: document.getElementById('auth-token'),
    overlayUrlInput: document.getElementById('overlay-url-input'),
    // Overlay specific
    iframe: document.getElementById('overlay-iframe'),
    activateFab: document.getElementById('activate-fab'),
    fabVisualizer: document.getElementById('fab-visualizer'),
    connectionStatus: document.getElementById('connection-status'),
    textBubble: document.getElementById('text-bubble'),
    bubbleText: document.getElementById('bubble-text')
};

/**
 * Initialize the application
 */
async function init() {
    log('Application starting...', 'info');
    
    // Load saved settings
    if (elements.wsUrlInput) elements.wsUrlInput.value = CONFIG.wsUrl;
    if (elements.wakeWordSelect) elements.wakeWordSelect.value = CONFIG.wakeWord;
    if (elements.authTokenInput) elements.authTokenInput.value = CONFIG.authToken;
    if (elements.overlayUrlInput) elements.overlayUrlInput.value = CONFIG.overlayUrl;

    // Set initial iframe URL if configured locally
    if (CONFIG.overlayUrl && elements.iframe) {
        elements.iframe.src = CONFIG.overlayUrl;
        log(`Loaded local overlay URL: ${CONFIG.overlayUrl}`, 'info');
    }
    
    // Setup event listeners
    if (elements.activateBtn) elements.activateBtn.addEventListener('click', toggleActivation);
    if (elements.activateFab) elements.activateFab.addEventListener('click', toggleActivation);
    
    if (elements.settingsBtn) elements.settingsBtn.addEventListener('click', toggleSettings);
    if (elements.saveSettings) elements.saveSettings.addEventListener('click', saveSettings);
    if (elements.clearLogBtn) elements.clearLogBtn.addEventListener('click', clearLog);
    
    // Install App logic
    if (elements.installBtn) elements.installBtn.addEventListener('click', installPWA);
    
    // Register Service Worker
    if ('serviceWorker' in navigator) {
        try {
            const registration = await navigator.serviceWorker.register('/sw.js');
            log('Service Worker registered', 'success');
        } catch (error) {
            log(`SW registration failed: ${error}`, 'error');
        }
    }

    // Auto-connect to WebSocket for config/status
    connectWebSocket();
    
    // Network status listeners
    window.addEventListener('online', () => {
        log('Network online, attempting reconnect...', 'info');
        connectWebSocket();
    });
    window.addEventListener('offline', () => {
        log('Network offline', 'warning');
        updateStatus('ws-status', 'disconnected', 'Offline');
        stopKeepAlive();
    });

    log('Application initialized', 'success');
}

/**
 * Toggle voice control activation
 */
async function toggleActivation() {
    if (!STATE.isActive) {
        await activate();
    } else {
        await deactivate();
    }
}

/**
 * Activate voice control
 */
async function activate() {
    try {
        log('Activating voice control...', 'info');
        
        // Initialize Audio Context
        await initAudioContext();
        
        // Ensure WebSocket is connected
        if (!STATE.ws || STATE.ws.readyState !== WebSocket.OPEN) {
             log('WebSocket not connecting, attempting to connect first...', 'warning');
             await connectWebSocket();
        }
        
        // Request microphone access
        const micSuccess = await requestMicrophone();
        if (!micSuccess) return; // Exit if mic failed
        
        // Load wake word model (if not already loaded)
        if (!STATE.onnxSessions.wakeWord) {
             await loadWakeWordModel();
        }
        
        STATE.isActive = true;
        updateUI();
        
        if (elements.activateBtn) {
            elements.activateBtn.innerHTML = '<span>Deactivate</span>';
            elements.activateBtn.classList.add('active');
        }
        if (elements.activateFab) {
            elements.activateFab.classList.add('active');
        }
        
        log('Voice control activated', 'success');
        if (window.showToast) window.showToast('Voice control activated', 'success');
        
    } catch (error) {
        log(`Activation failed: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Activation failed: ' + error.message, 'error');
        await deactivate();
    }
}

/**
 * Deactivate voice control
 */
async function deactivate() {
    log('Deactivating voice control...', 'info');
    
    if (STATE.audioWorkletNode) {
        STATE.audioWorkletNode.disconnect();
        STATE.audioWorkletNode = null;
    }
    
    if (STATE.mediaStream) {
        STATE.mediaStream.getTracks().forEach(track => track.stop());
        STATE.mediaStream = null;
    }
    
    // Do not close AudioContext completely if we want to reuse it, but strict cleanup is safer
    if (STATE.audioContext) {
        await STATE.audioContext.close();
        STATE.audioContext = null;
    }
    
    STATE.isActive = false;
    STATE.isListening = false;
    
    updateUI();
    
    if (elements.activateBtn) {
        elements.activateBtn.innerHTML = '<span>Activate Voice Control</span>';
        elements.activateBtn.classList.remove('active');
    }
    if (elements.activateFab) {
        elements.activateFab.classList.remove('active');
        elements.activateFab.classList.remove('listening');
    }
    
    updateStatus('mic-status', 'inactive', 'Inactive');
    log('Voice control deactivated', 'info');
}

/**
 * Initialize Web Audio Context
 */
async function initAudioContext() {
    if (!STATE.audioContext) {
        STATE.audioContext = new (window.AudioContext || window.webkitAudioContext)();
        log(`Audio context initialized at ${STATE.audioContext.sampleRate}Hz`, 'info');
        
        if (STATE.audioContext.sampleRate !== 16000) {
             const msg = `Sample rate is ${STATE.audioContext.sampleRate}Hz. Resampling active (Robust).`;
             console.warn(msg);
        }
    }
    
    if (STATE.audioContext.state === 'suspended') {
        await STATE.audioContext.resume();
    }
}

/**
 * Connect to WebSocket server with Robust Reconnection
 */
function connectWebSocket() {
    if (STATE.ws && (STATE.ws.readyState === WebSocket.OPEN || STATE.ws.readyState === WebSocket.CONNECTING)) {
        return; // Already connected or connecting
    }

    // Clear any pending reconnects to avoid double-firing
    if (STATE.reconnectTimer) clearTimeout(STATE.reconnectTimer);

    log(`Connecting to ${CONFIG.wsUrl} (Attempt ${STATE.reconnectAttempts + 1})...`, 'info');
    if (window.showToast && STATE.reconnectAttempts > 0) window.showToast('Reconnecting to server...', 'info', 2000);
    
    STATE.ws = new WebSocket(CONFIG.wsUrl);
    
    STATE.ws.onopen = async () => {
        log('WebSocket connected', 'success');
        updateStatus('ws-status', 'connected', 'Connected');
        if (window.showToast) window.showToast('Connected to server', 'success');
        
        // Reset reconnect strategy
        STATE.reconnectAttempts = 0;
        
        // Start Heartbeat
        startKeepAlive();
        
        // Authenticate if token is set
        if (CONFIG.authToken) {
            STATE.ws.send(JSON.stringify({ type: 'auth', token: CONFIG.authToken }));
        }

        // Request initial status and config
        STATE.ws.send(JSON.stringify({ type: 'status_request' }));
    };
    
    STATE.ws.onclose = (event) => {
        updateStatus('ws-status', 'disconnected', 'Disconnected');
        stopKeepAlive();
        
        if (event.wasClean) {
            log(`WebSocket closed cleanly`, 'info');
        } else {
            log(`WebSocket disconnected unexpectedly`, 'warning');
            scheduleReconnect();
        }
    };
    
    STATE.ws.onerror = (error) => {
        log('WebSocket error occurred', 'error');
        // onerror is usually followed by onclose, so we handle reconnect there
        // unless it fails to connect at all in the beginning
    };
    
    STATE.ws.onmessage = handleWebSocketMessage;
}

/**
 * Exponential Backoff Reconnect Logic
 */
function scheduleReconnect() {
    if (STATE.reconnectTimer) return; // Already scheduled

    STATE.reconnectAttempts++;
    
    // Exponential backoff: 1s, 2s, 4s, 8s, 16s... capped at 30s
    const backoff = Math.min(1000 * Math.pow(2, STATE.reconnectAttempts - 1), 30000);
    
    log(`Reconnecting in ${backoff/1000}s...`, 'info');
    
    STATE.reconnectTimer = setTimeout(() => {
        STATE.reconnectTimer = null;
        if (navigator.onLine) {
            connectWebSocket();
        } else {
            log('Waiting for network...', 'warning');
            // Check again in 5s if offline logic didn't catch it
            STATE.reconnectTimer = setTimeout(() => scheduleReconnect, 5000); 
        }
    }, backoff);
}

/**
 * Keep-Alive Heartbeat
 */
function startKeepAlive() {
    stopKeepAlive(); // Ensure no duplicates
    
    STATE.pingInterval = setInterval(() => {
        if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
            // Send ping
            STATE.ws.send(JSON.stringify({ type: 'ping' }));
            
            // Set timeout for pong
            STATE.pongTimeout = setTimeout(() => {
                log('Connection dead (no pong), terminating...', 'error');
                if (STATE.ws) STATE.ws.close(); // This will trigger onclose -> reconnect
            }, CONFIG.pongTimeoutMs);
        }
    }, CONFIG.pingIntervalMs);
}

function stopKeepAlive() {
    if (STATE.pingInterval) clearInterval(STATE.pingInterval);
    if (STATE.pongTimeout) clearTimeout(STATE.pongTimeout);
    STATE.pingInterval = null;
    STATE.pongTimeout = null;
}

/**
 * Handle incoming WebSocket messages
 */
async function handleWebSocketMessage(event) {
    if (event.data instanceof Blob) {
        // Binary audio data (TTS response)
        const arrayBuffer = await event.data.arrayBuffer();
        await playAudioResponse(arrayBuffer);
    } else {
        // Text/JSON message
        try {
            const message = JSON.parse(event.data);
            handleControlMessage(message);
        } catch (e) {
            log(`Invalid message: ${e}`, 'error');
        }
    }
}

/**
 * Handle control messages from server
 */
function handleControlMessage(message) {
    switch (message.type) {
        case 'auth_ok':
            log('Authentication successful', 'success');
            break;
        case 'auth_failed':
            log('Authentication failed', 'error');
            if (window.showToast) window.showToast('Auth failed: Check token', 'error');
            deactivate();
            break;
        case 'pong':
            // Heartbeat response
            if (STATE.pongTimeout) {
                clearTimeout(STATE.pongTimeout);
                STATE.pongTimeout = null;
            }
            break;
        case 'config_audio':
            if (message.rate) {
                STATE.currentTtsRate = message.rate;
                // Reset audio scheduling for new stream
                if (STATE.audioContext) STATE.nextAudioTime = STATE.audioContext.currentTime + 0.1;
            }
            break;
        case 'status':
            updateStatus('ha-status', 
                message.ha_connected ? 'connected' : 'disconnected',
                message.ha_connected ? 'Connected' : 'Disconnected'
            );
            // Handle Config if present (Overlay URL)
            const targetUrl = CONFIG.overlayUrl || (message.config && message.config.overlay_url);
            if (targetUrl && elements.iframe) {
                 if (elements.iframe.src !== targetUrl && elements.iframe.src === 'about:blank') {
                    elements.iframe.src = targetUrl;
                    log(`Loaded overlay URL: ${targetUrl}`, 'info');
                }
            }
            break;
        case 'config_update':
             if (message.wake_word) {
                 log(`Server updated wake word to: ${message.wake_word}`, 'info');
                 CONFIG.wakeWord = message.wake_word;
                 if (elements.wakeWordSelect) elements.wakeWordSelect.value = message.wake_word;
                 if (STATE.isActive) loadWakeWordModel().catch(console.error);
             }
             break;
        case 'voice_event':
             handleVoiceEvent(message);
             break;
        case 'ha_status':
             if (typeof message.connected !== 'undefined') {
                 const status = message.connected ? 'active' : 'disconnected';
                 const label = message.connected ? 'Connected' : 'Disconnected';
                 updateStatus('ha-status', status, label);
             }
             break;
    }
}

/**
 * Handle voice assistant events (STT/TTS text)
 */
function handleVoiceEvent(message) {
    const eventType = message.event_type;
    const data = message.data || {};
    
    if (eventType === 3) { // STT_START
        showBubble("Listening...");
    } else if (eventType === 4) { // STT_END
        if (data.text) showBubble(`"${data.text}"`);
        if (STATE.isListening) {
             STATE.isListening = false;
             updateUI();
             log('Speech captured', 'info');
             
             if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
                 STATE.ws.send(JSON.stringify({ type: 'stop' }));
             }
        }
        if (STATE.silenceTimer) clearTimeout(STATE.silenceTimer);
        
    } else if (eventType === 7) { // TTS_START
        if (data.text) showBubble(data.text);
    } else if (eventType === 2) { // RUN_END
        setTimeout(() => hideBubble(), 5000);
        if (STATE.isListening) {
             STATE.isListening = false;
             updateUI();
        }
    }
}

/**
 * UI Bubble Helpers
 */
function showBubble(text) {
    if (elements.bubbleText) {
        elements.bubbleText.textContent = text;
        if (elements.textBubble) elements.textBubble.classList.remove('hidden');
    }
}

function hideBubble() {
    if (elements.textBubble) elements.textBubble.classList.add('hidden');
}

/**
 * Request microphone access
 */
async function requestMicrophone() {
    try {
        log('Requesting microphone access...', 'info');
        STATE.mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                sampleRate: CONFIG.sampleRate,
                channelCount: CONFIG.channels,
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            }
        });
        updateStatus('mic-status', 'active', 'Active');
        log('Microphone access granted', 'success');
        
        const source = STATE.audioContext.createMediaStreamSource(STATE.mediaStream);
        await setupAudioProcessing(source);
        return true;
        
    } catch (error) {
        log(`Microphone access denied: ${error.message}`, 'error');
        if (window.showToast) {
            window.showToast('Microphone denied. Check browser settings.', 'error', 5000);
        }
        updateStatus('mic-status', 'inactive', 'Denied');
        return false;
    }
}

/**
 * Setup audio processing for wake word detection
 */
async function setupAudioProcessing(source) {
    try {
        await STATE.audioContext.audioWorklet.addModule('wake-word-processor.js');
        const workletNode = new AudioWorkletNode(STATE.audioContext, 'wake-word-processor');
        
        workletNode.port.onmessage = async (event) => {
            const float32Data = event.data;
            if (!STATE.isInferencing) {
                STATE.isInferencing = true;
                await runWakeWordInference(float32Data);
                STATE.isInferencing = false;
            }
            
            // If server is expecting audio (Listening state)
            if (STATE.isListening && STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
                // Convert Float32 to Int16
                const int16Data = new Int16Array(float32Data.length);
                for (let i = 0; i < float32Data.length; i++) {
                    const s = Math.max(-1, Math.min(1, float32Data[i]));
                    int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                STATE.ws.send(int16Data.buffer);
            }
        };
        
        source.connect(workletNode);
        workletNode.connect(STATE.audioContext.destination);
        STATE.audioWorkletNode = workletNode;
        log('Audio processing configured (AudioWorklet)', 'info');
    } catch (e) {
        log(`Failed to setup AudioWorklet: ${e.message}`, 'error');
        throw e;
    }
}

/**
 * Run ONNX inference on audio chunk
 */
async function runWakeWordInference(float32Data) {
    if (!STATE.onnxSessions.mel || !STATE.onnxSessions.embedding || !STATE.onnxSessions.wakeWord) return;
    
    try {
        // --- 1. Melspectrogram ---
        const melInputName = STATE.onnxSessions.mel.inputNames[0];
        const audioTensor = new ort.Tensor('float32', Float32Array.from(float32Data), [1, float32Data.length]);
        
        const melResults = await STATE.onnxSessions.mel.run({ [melInputName]: audioTensor });
        let melOutput = melResults[STATE.onnxSessions.mel.outputNames[0]].data;

        // Normalization
        for (let j = 0; j < melOutput.length; j++) {
            melOutput[j] = (melOutput[j] / 10.0) + 2.0;
        }

        // Split 160 features into 5 frames of 32
        for (let j = 0; j < 5; j++) {
            const frame = melOutput.subarray(j * 32, (j + 1) * 32);
            STATE.buffers.mel.push(new Float32Array(frame));
        }

        // Process while we have enough frames (sliding window)
        while (STATE.buffers.mel.length >= 76) {
             // Flatten Mel Buffer
             const flatMel = new Float32Array(76 * 32);
             for (let i = 0; i < 76; i++) {
                 flatMel.set(STATE.buffers.mel[i], i * 32);
             }
             
             // --- 2. Embedding ---
             const embInputName = STATE.onnxSessions.embedding.inputNames[0];
             const melTensor = new ort.Tensor('float32', flatMel, [1, 76, 32, 1]);
             
             const embResults = await STATE.onnxSessions.embedding.run({ [embInputName]: melTensor });
             const embOutput = embResults[STATE.onnxSessions.embedding.outputNames[0]].data;
             
             // --- 3. Accumulate Embeddings ---
             STATE.buffers.emb.shift();
             STATE.buffers.emb.push(new Float32Array(embOutput));
             
             // --- 4. Wake Word ---
             if (STATE.isListening) {
                 STATE.buffers.mel.splice(0, 8);
                 continue;
             }
             
             // Flatten Embedding
             const flatEmb = new Float32Array(16 * 96);
             for (let i = 0; i < 16; i++) {
                 flatEmb.set(STATE.buffers.emb[i], i * 96);
             }
             
             const item = STATE.onnxSessions.wakeWord; 
             const wwInputName = item.inputNames[0];
             const embTensor = new ort.Tensor('float32', flatEmb, [1, 16, 96]);
             
             const wwResults = await item.run({ [wwInputName]: embTensor });
             const probability = wwResults[item.outputNames[0]].data[0];
             
             if (probability > 0.5) {
                  log(`Wake word detected! (${(probability * 100).toFixed(1)}%)`, 'success');
                  triggerWakeWord();
             }
             
             // Stride: Remove 8 frames
             STATE.buffers.mel.splice(0, 8);
        }

    } catch (e) {
        if (!STATE.lastError || STATE.lastError !== e.message) {
            log(`Inference error: ${e.message}`, 'error');
            STATE.lastError = e.message;
        }
    }
}

function triggerWakeWord() {
    if (!STATE.isListening) {
        STATE.isListening = true;
        
        // Vibration Feedback
        if (navigator.vibrate) {
            navigator.vibrate(200);
        }
        
        // Play Feedback Sound (Beep)
        playWakeSound();
        
        updateUI();
        
        // Reset audio scheduling
        if (STATE.audioContext) {
            STATE.nextAudioTime = STATE.audioContext.currentTime;
        }

        // Notify server
        if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
            STATE.ws.send(JSON.stringify({ 
                type: 'wake_detected',
                wake_word: CONFIG.wakeWord 
            }));
        }
        
        // Stop listening after 15 seconds (Safety timeout)
        if (STATE.silenceTimer) clearTimeout(STATE.silenceTimer);
        STATE.silenceTimer = setTimeout(() => {
            if (STATE.isListening) {
                STATE.isListening = false;
                updateUI();
                log('Listening timeout', 'info');
                
                if (STATE.ws && STATE.ws.readyState === WebSocket.OPEN) {
                    STATE.ws.send(JSON.stringify({ type: 'stop' }));
                }
                
                // Reset buffers
                STATE.buffers.mel = [];
                STATE.buffers.emb = new Array(16).fill(0).map(() => new Float32Array(96).fill(0));
            }
        }, 8000);
    }
}

/**
 * Load wake word models
 */
async function loadWakeWordModel() {
    try {
        log('Loading ONNX models...', 'info');
        if (window.showToast) window.showToast('Loading models...', 'info');
        
        const modelPath = 'models';
        const wakeWordId = CONFIG.wakeWord;
        
        // Load Melspectrogram model
        STATE.onnxSessions.mel = await ort.InferenceSession.create(`${modelPath}/melspectrogram.onnx`, { executionProviders: ['wasm'] });
        
        // Load Embedding model
        STATE.onnxSessions.embedding = await ort.InferenceSession.create(`${modelPath}/embedding_model.onnx`, { executionProviders: ['wasm'] });
        
        // Load Wake Word model
        STATE.onnxSessions.wakeWord = await ort.InferenceSession.create(`${modelPath}/${wakeWordId}.onnx`, { executionProviders: ['wasm'] });
        
        // Reset buffers
        STATE.buffers.mel = [];
        STATE.buffers.emb = new Array(16).fill(0).map(() => new Float32Array(96).fill(0));
        STATE.lastError = null;

        log(`Models loaded successfully`, 'success');
        if (window.showToast) window.showToast('Voice models ready', 'success');
        
    } catch (error) {
        log(`Failed to load models: ${error.message}`, 'error');
        if (window.showToast) window.showToast('Failed to load models', 'error');
        throw error;
    }
}

/**
 * Play audio response from server (Raw PCM)
 */
async function playAudioResponse(arrayBuffer) {
    if (!STATE.audioContext) {
        if (STATE.isActive) {
             console.warn('AudioContext lost but state is active. Re-initializing...');
             await initAudioContext();
        } else {
             return;
        }
    }

    try {
        // Detect and skip WAV header (RIFF)
        if (arrayBuffer.byteLength > 44) {
            const headerView = new DataView(arrayBuffer);
            if (headerView.getUint32(0, false) === 0x52494646) {
                arrayBuffer = arrayBuffer.slice(44);
            }
        }

        const int16Data = new Int16Array(arrayBuffer);
        const float32Data = new Float32Array(int16Data.length);
        
        for (let i = 0; i < int16Data.length; i++) {
            float32Data[i] = int16Data[i] / 32768.0;
        }
        
        const rate = STATE.currentTtsRate || CONFIG.ttsSampleRate || 22050; 
        const buffer = STATE.audioContext.createBuffer(1, float32Data.length, rate);
        buffer.getChannelData(0).set(float32Data);
        
        const source = STATE.audioContext.createBufferSource();
        source.buffer = buffer;
        source.connect(STATE.audioContext.destination);
        
        const currentTime = STATE.audioContext.currentTime;
        if (!STATE.nextAudioTime || STATE.nextAudioTime < currentTime) {
           STATE.nextAudioTime = currentTime;
        }
        
        source.start(STATE.nextAudioTime);
        STATE.nextAudioTime += buffer.duration;
        
    } catch (error) {
        log(`Failed to play audio: ${error.message}`, 'error');
    }
}

/**
 * Update UI based on current state
 */
function updateUI() {
    if (STATE.isListening) {
        if (elements.micVisualizer) {
            elements.micVisualizer.classList.add('listening');
        }
        if (elements.stateText) {
            elements.stateText.textContent = 'Listening...';
        }
        if (elements.activateFab) {
            elements.activateFab.classList.add('listening');
        }
        if (elements.fabVisualizer) elements.fabVisualizer.classList.remove('hidden');
        
    } else if (STATE.isActive) {
        if (elements.micVisualizer) {
            elements.micVisualizer.classList.add('active');
            elements.micVisualizer.classList.remove('listening');
        }
        if (elements.stateText) {
            elements.stateText.textContent = 'Ready';
        }
        if (elements.activateFab) {
            elements.activateFab.classList.remove('listening');
            elements.activateFab.classList.add('active');
        }
        if (elements.fabVisualizer) elements.fabVisualizer.classList.add('hidden');
        
    } else {
        if (elements.micVisualizer) {
            elements.micVisualizer.classList.remove('active', 'listening');
        }
        if (elements.stateText) {
            elements.stateText.textContent = 'Click to activate';
        }
        if (elements.activateFab) {
            elements.activateFab.classList.remove('active', 'listening');
        }
        if (elements.fabVisualizer) elements.fabVisualizer.classList.add('hidden');
    }
}

function updateStatus(elementId, status, text) {
    const element = document.getElementById(elementId);
    if (element) {
        element.className = `status-badge ${status}`;
        element.textContent = text;
    }
    
    // Update FAB connection dot if it exists
    if (elements.connectionStatus && elementId === 'ws-status') {
        elements.connectionStatus.className = `status-dot ${status}`;
    }
}

/**
 * Toggle settings panel
 */
function toggleSettings() {
    elements.settingsPanel.classList.toggle('hidden');
}

/**
 * Save settings
 */
function saveSettings() {
    CONFIG.wsUrl = elements.wsUrlInput.value;
    CONFIG.wakeWord = elements.wakeWordSelect.value;
    CONFIG.authToken = elements.authTokenInput.value;
    if (elements.overlayUrlInput) CONFIG.overlayUrl = elements.overlayUrlInput.value;
    
    localStorage.setItem('wsUrl', CONFIG.wsUrl);
    localStorage.setItem('wakeWord', CONFIG.wakeWord);
    localStorage.setItem('authToken', CONFIG.authToken);
    if (elements.overlayUrlInput) localStorage.setItem('overlayUrl', CONFIG.overlayUrl);
    
    // Apply Overlay URL immediately if changed
    if (CONFIG.overlayUrl && elements.iframe && elements.iframe.src !== CONFIG.overlayUrl) {
        elements.iframe.src = CONFIG.overlayUrl;
    }
    
    // Reload models if active
    if (STATE.isActive) {
        loadWakeWordModel().catch(console.error);
    }
    
    log('Settings saved', 'success');
    if (window.showToast) window.showToast('Settings saved', 'success');
    toggleSettings();
}

/**
 * Log message to debug panel
 */
function log(message, type = 'info') {
    console.log(`[${type.toUpperCase()}] ${message}`);

    if (elements.debugLog.classList.contains('hidden') && type !== 'error') {
        return;
    }

    const time = new Date().toLocaleTimeString();
    const entry = document.createElement('div');
    entry.className = 'log-entry';
    entry.innerHTML = `<span class="log-time">${time}</span><span class="log-${type}">${message}</span>`;
    
    if (elements.debugLog.children.length > 50) {
        elements.debugLog.removeChild(elements.debugLog.firstChild);
    }

    elements.debugLog.appendChild(entry);
    requestAnimationFrame(() => {
        elements.debugLog.scrollTop = elements.debugLog.scrollHeight;
    });
}

function clearLog() {
    elements.debugLog.innerHTML = '';
}

// PWA Install Prompt
let deferredPrompt;

window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (elements.installBtn) {
        elements.installBtn.style.display = 'inline-flex';
        elements.installBtn.classList.remove('hidden');
        log('App install available', 'info');
    }
});

async function installPWA() {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    log(`User response to install prompt: ${outcome}`, 'info');
    deferredPrompt = null;
    if (elements.installBtn) {
       elements.installBtn.style.display = 'none';
    }
}

// Handle page unload
window.addEventListener('beforeunload', () => {
    // Only deactivate if we really need to, otherwise let session persist
    // But audio context usually needs cleanup.
});

// Init
document.addEventListener('DOMContentLoaded', init);

/**
 * Play a short beep sound for wake word confirmation
 */
function playWakeSound() {
    if (!STATE.audioContext) return;
    
    try {
        const oscillator = STATE.audioContext.createOscillator();
        const gainNode = STATE.audioContext.createGain();
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(880, STATE.audioContext.currentTime); // A5
        oscillator.frequency.exponentialRampToValueAtTime(440, STATE.audioContext.currentTime + 0.1); // Drop to A4
        
        gainNode.gain.setValueAtTime(0.1, STATE.audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, STATE.audioContext.currentTime + 0.1);
        
        oscillator.connect(gainNode);
        gainNode.connect(STATE.audioContext.destination);
        
        oscillator.start();
        oscillator.stop(STATE.audioContext.currentTime + 0.15);
    } catch (e) {
        console.error('Error playing wake sound:', e);
    }
}
