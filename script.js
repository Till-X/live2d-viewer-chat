// Expose PIXI to window for the plugin to register itself if needed
window.PIXI = PIXI;

(async function () {
    // Debug: Check if Live2DModel is available
    if (!PIXI.live2d) {
        console.error("PIXI.live2d is undefined. pixi-live2d-display plugin might not have loaded correctly.");
    }
    
    // Access Live2DModel from the global PIXI object
    // Note: PIXI.live2d might be undefined if the plugin failed to register
    const Live2DModel = PIXI.live2d ? PIXI.live2d.Live2DModel : null;

    // Track the current model globally within this scope
    let currentModel = null;

    if (!Live2DModel) {
        console.error("Live2DModel is not defined in PIXI.live2d");
        return;
    }

    // 1. Initialize Pixi Application
    const canvas = document.getElementById('canvas');
    const app = new PIXI.Application({
        view: canvas,
        autoStart: true,
        resizeTo: window,
        backgroundColor: 0x333333,
        antialias: true // Smoother edges
    });

    // 2. Load Live2D Model Function
    async function loadLive2DModel(modelUrl) {
        try {
            console.log("Loading model:", modelUrl);
            
            // Load the model
            const model = await Live2DModel.from(modelUrl);
            currentModel = model;

            // Clear previous models if any
            app.stage.removeChildren();
            
            // Add to stage
            app.stage.addChild(model);

            // 3. Auto Scale and Center
            fitModelToScreen(model);

            // 4. Mouse Interaction (Look at mouse)
            // The model needs to track mouse position for "looking"
            // We can register a global pointer move event
            
            // Enable interaction on the model to ensure it catches events if needed
            model.interactive = true;

            // 5. Hit Area Detection (Double Click to Trigger)
            // We use the library's built-in 'hit' event which is reliable.
            // We implement a custom double-click detection logic.
            
            let lastHitTime = 0;
            const DOUBLE_CLICK_DELAY = 500; // ms

            model.on('hit', (hitAreas) => {
                const currentTime = Date.now();
                const timeDiff = currentTime - lastHitTime;

                if (hitAreas && hitAreas.length > 0) {
                    console.log('%c Built-in Hit Event:', 'color: cyan;', hitAreas);
                    
                    if (timeDiff < DOUBLE_CLICK_DELAY) {
                        // Double Click Detected!
                        console.log('%c Double Click Confirmed!', 'color: #00ff00; font-weight: bold;', hitAreas);
                        
                        // Generate third-person action description
                        const parts = hitAreas.join(' and ');
                        const actionDescription = `*touches your ${parts}*`;
                        
                        // Trigger chat with this action
                        sendMessage(actionDescription);
                        
                        // Reset timer to prevent triple-click triggering
                        lastHitTime = 0;
                    } else {
                        // First Click - record time
                        lastHitTime = currentTime;
                    }
                }
            });

            // Handle looking at mouse
            // Live2D models usually respond to 'focus' with x, y in range [-1, 1] usually,
            // or we can just use the internal tracker if configured.
            // But pixi-live2d-display simplifies this: we can just call model.focus(x, y)
            // x, y are relative to the model center usually? Or screen coords?
            // The library documentation says model.focus(x, y) where x,y are in world coordinates?
            // Actually, the library handles hit testing and focus. 
            // Let's just pass the mouse position relative to the center of the screen or model?
            
            // Standard approach: Listen to global pointer move
            window.addEventListener('pointermove', (event) => {
                // Convert to point in renderer
                // focus() expects coordinates relative to the model's center? 
                // No, model.focus(x, y) takes global coordinates (world space) usually.
                // Let's try passing the global interaction point.
                
                model.focus(event.clientX, event.clientY);
            });

            console.log("Model loaded successfully!");

        } catch (error) {
            console.error("Failed to load model:", error);
        }
    }

    function fitModelToScreen(model) {
        // Reset scale to calculate original size
        model.scale.set(1, 1);
        
        // Get model bounds
        const bounds = model.getBounds();
        // Use internal model width/height if available for better accuracy, 
        // but bounds is safer for visual fit.
        const modelWidth = bounds.width;
        const modelHeight = bounds.height;

        // Get screen size
        const screenWidth = app.screen.width;
        const screenHeight = app.screen.height;
        const isMobile = window.innerWidth < 768;

        // Calculate scale
        // Mobile: Fill more space (90% width or height)
        // Desktop: Standard 80%
        const fitFactor = isMobile ? 0.95 : 0.8;
        
        let scale = Math.min(
            (screenWidth * fitFactor) / modelWidth,
            (screenHeight * fitFactor) / modelHeight
        );
        
        // Clamp scale to reasonable limits
        scale = Math.max(0.1, Math.min(scale, 2.0));

        // Apply scale
        model.scale.set(scale, scale);

        // Center the model
        // Recalculate dimensions after scaling
        const scaledWidth = modelWidth * scale;
        const scaledHeight = modelHeight * scale;
        
        model.x = (screenWidth - scaledWidth) / 2;
        
        // Vertical Alignment
        if (isMobile) {
            // On mobile, maybe align lower to leave room for top content?
            // But we have windows at bottom. Center is safest.
            model.y = (screenHeight - scaledHeight) / 2;
        } else {
            model.y = (screenHeight - scaledHeight) / 2;
        }

        console.log(`Model scaled to ${scale.toFixed(2)} and centered.`);
    }

    // Handle Window Resize (Throttled)
    window.addEventListener('resize', throttle(() => {
        if (app.stage.children.length > 0) {
            fitModelToScreen(app.stage.children[0]);
        }
    }, 100));

    // 6. UI Logic & Model Management
    const modelList = document.getElementById('model-list');
    const uploadBtn = document.getElementById('upload-btn');
    const fileInput = document.getElementById('model-upload');
    const nameInput = document.getElementById('model-name-input');
    const nameMsg = document.getElementById('name-validation-msg');

    let currentModelUrl = null;

    // Helper: Validate model name
    function validateModelName(name) {
        if (!name) return true; // Empty is allowed (auto-generate)
        const regex = /^[a-zA-Z0-9_]{2,50}$/;
        return regex.test(name);
    }

    // Input Validation Event
    nameInput.addEventListener('input', () => {
        const name = nameInput.value.trim();
        if (name === '') {
            nameMsg.textContent = '';
            nameMsg.className = '';
            uploadBtn.disabled = false;
            return;
        }

        if (validateModelName(name)) {
            nameMsg.textContent = '✓ Valid name';
            nameMsg.className = 'valid-msg';
            uploadBtn.disabled = false;
        } else {
            nameMsg.textContent = '✗ Invalid (2-50 chars, letters/numbers/_)';
            nameMsg.className = 'invalid-msg';
            uploadBtn.disabled = true;
        }
    });

    // Fetch and populate model list
    async function fetchModelList() {
        try {
            const response = await fetch('/api/models');
            const data = await response.json();
            const models = data.models;

            // Clear list
            modelList.innerHTML = '';

            if (models.length === 0) {
                const li = document.createElement('li');
                li.className = 'model-item';
                li.innerHTML = '<span class="model-name">No models found</span>';
                modelList.appendChild(li);
                return;
            }

            models.forEach(model => {
                const li = document.createElement('li');
                li.className = 'model-item';
                if (model.url === currentModelUrl) {
                    li.classList.add('active');
                }
                
                // Name span
                const nameSpan = document.createElement('span');
                nameSpan.className = 'model-name';
                nameSpan.textContent = model.name;
                
                // Delete button
                const deleteBtn = document.createElement('button');
                deleteBtn.className = 'delete-btn';
                deleteBtn.innerHTML = '×';
                deleteBtn.title = 'Delete Model';
                
                // Click handler for selecting model
                li.addEventListener('click', (e) => {
                    // Ignore if clicked on delete button
                    if (e.target === deleteBtn) return;
                    
                    if (currentModelUrl !== model.url) {
                        loadLive2DModel(model.url);
                        currentModelUrl = model.url;
                        // Update active state
                        document.querySelectorAll('.model-item').forEach(item => item.classList.remove('active'));
                        li.classList.add('active');
                    }
                });

                // Click handler for delete
                deleteBtn.addEventListener('click', async (e) => {
                    e.stopPropagation();
                    if (confirm(`Are you sure you want to delete "${model.name}"? This cannot be undone.`)) {
                        await deleteModel(model.name);
                    }
                });

                li.appendChild(nameSpan);
                li.appendChild(deleteBtn);
                modelList.appendChild(li);
            });

            // Initial Load Logic
            if (!currentModelUrl && models.length > 0 && app.stage.children.length === 0) {
                 // Load first model by default
                 const firstModel = models[0];
                 loadLive2DModel(firstModel.url);
                 currentModelUrl = firstModel.url;
                 // Mark first item active (simplification)
                 // Re-rendering or manually selecting would be better, but this works for init
                 const firstLi = modelList.firstChild;
                 if (firstLi) firstLi.classList.add('active');
            }
        } catch (error) {
            console.error("Failed to fetch model list:", error);
            modelList.innerHTML = '<li class="model-item" style="color:red">Failed to load list</li>';
        }
    }

    // Delete Model Function
    async function deleteModel(modelName) {
        try {
            const response = await fetch(`/api/models/${modelName}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Delete failed");
            }

            console.log(`Model ${modelName} deleted.`);
            
            // If we deleted the current model, clear the stage
            // We can't easily check if the deleted model URL matches currentModelUrl without full path
            // But usually modelName maps to folder name. 
            // Simplest is to just reload list. If the current model file is gone, Pixi might crash on next interaction?
            // Actually, loaded model stays in memory. But let's clear it if we want to be safe, 
            // or just leave it until user switches.
            
            await fetchModelList();

        } catch (error) {
            console.error("Delete error:", error);
            alert("Failed to delete model: " + error.message);
        }
    }

    // Handle file upload
    uploadBtn.addEventListener('click', async () => {
        const file = fileInput.files[0];
        if (!file) {
            alert("Please select a .zip file first.");
            return;
        }

        const customName = nameInput.value.trim();
        if (customName && !validateModelName(customName)) {
            alert("Invalid name format.");
            return;
        }

        const formData = new FormData();
        formData.append('file', file);
        if (customName) {
            formData.append('custom_name', customName);
        }

        try {
            uploadBtn.disabled = true;
            uploadBtn.textContent = "Uploading...";
            
            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(errorData.detail || "Upload failed");
            }

            const result = await response.json();
            alert("Upload successful!");
            
            // Reset inputs
            fileInput.value = '';
            nameInput.value = '';
            nameMsg.textContent = '';
            
            // Refresh list
            await fetchModelList();
            
        } catch (error) {
            console.error("Upload error:", error);
            alert("Upload failed: " + error.message);
        } finally {
            uploadBtn.disabled = false;
            uploadBtn.textContent = "Upload .zip";
        }
    });

    // Initial fetch
    fetchModelList();

    // --- Chat & Settings Logic ---
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatMessages = document.getElementById('chat-messages');
    const settingsBtn = document.getElementById('settings-btn');
    const resetBtn = document.getElementById('reset-btn');
    
    const settingsPanel = document.getElementById('settings-panel');
    const systemPromptInput = document.getElementById('system-prompt-input');
    const saveSettingsBtn = document.getElementById('save-settings-btn');
    const closeSettingsBtn = document.getElementById('close-settings-btn');

    // Speech Bubble Logic
    const bubble = document.getElementById('speech-bubble');
    const bubbleText = document.getElementById('bubble-text');
    let bubbleTimeout;

    function showBubble(text) {
        // Simple typewriter effect or direct text? User asked for typewriter OR direct.
        // Let's go with direct for responsiveness first, maybe add typewriter later if requested.
        bubbleText.textContent = text;
        bubble.classList.remove('hidden');
        bubble.classList.add('visible');
        
        if (bubbleTimeout) clearTimeout(bubbleTimeout);
        bubbleTimeout = setTimeout(() => {
            bubble.classList.remove('visible');
            bubble.classList.add('hidden');
        }, 5000); // 5 seconds for reading
    }

    // --- ASR Logic ---
    const micBtn = document.getElementById('mic-btn');
    const asrStatus = document.getElementById('asr-status');
    let mediaRecorder;
    let audioContext;
    let asrSocket;
    let isRecording = false;

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            
            // Init WebSocket
            const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
            asrSocket = new WebSocket(`${protocol}//${window.location.host}/ws/asr`);
            
            asrSocket.onopen = async () => {
                console.log("ASR WebSocket Open");
                micBtn.classList.add('recording');
                isRecording = true;
                asrStatus.textContent = "Listening...";
                
                try {
                    // Init Audio Processing
                    audioContext = new AudioContext({ sampleRate: 16000 });
                    await audioContext.audioWorklet.addModule('audio-processor.js');
                    
                    const source = audioContext.createMediaStreamSource(stream);
                    const processor = new AudioWorkletNode(audioContext, 'audio-processor');
                    
                    processor.port.onmessage = (e) => {
                        if (!isRecording || asrSocket.readyState !== WebSocket.OPEN) return;
                        asrSocket.send(e.data);
                    };
                    
                    source.connect(processor);
                    processor.connect(audioContext.destination);
                } catch (e) {
                    console.error("AudioWorklet setup error:", e);
                    stopRecording();
                }
            };

            asrSocket.onmessage = (event) => {
                const data = JSON.parse(event.data);
                if (data.text) {
                    chatInput.value = data.text;
                } 
                
                if (data.is_final) {
                    console.log("ASR Finished");
                    // Stop cleanup is already done partially in stopRecording, 
                    // but ensure everything is clean.
                    stopRecordingCleanup(); 
                    asrSocket.close();
                    
                    // Auto send
                    if (chatInput.value.trim()) {
                        sendMessage();
                    }
                } else if (data.error) {
                    console.error("ASR Error:", data.error);
                    asrStatus.textContent = "Error";
                }
            };

            asrSocket.onclose = () => {
                console.log("ASR WebSocket Closed");
                stopRecordingCleanup();
            };

        } catch (err) {
            console.error("Microphone access error:", err);
            alert("Microphone access denied or error: " + err.message);
        }
    }

    function stopRecording() {
        if (asrSocket && asrSocket.readyState === WebSocket.OPEN) {
            // Send stop signal
            asrSocket.send(JSON.stringify({ type: "stop" }));
        }
        
        // Stop audio capture locally
        isRecording = false;
        micBtn.classList.remove('recording');
        asrStatus.textContent = "Processing...";
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
    }

    function stopRecordingCleanup() {
        isRecording = false;
        micBtn.classList.remove('recording');
        asrStatus.textContent = "";
        
        if (audioContext) {
            audioContext.close();
            audioContext = null;
        }
        // Stop all tracks
        // (If we stored the stream, we should stop it here to release mic)
    }

    // Mic Button Events
    // Desktop: Click to toggle (or Hold?) Let's do Click Toggle for simplicity first
    // Mobile: Touch Hold is better, but Toggle is easier to implement cross-platform initially.
    // User requirement: "Hold to Speak" usually implies hold. Let's try Hold.
    
    micBtn.addEventListener('mousedown', (e) => {
        e.preventDefault();
        startRecording();
    });

    micBtn.addEventListener('mouseup', (e) => {
        e.preventDefault();
        stopRecording();
    });
    
    micBtn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        startRecording();
    });

    micBtn.addEventListener('touchend', (e) => {
        e.preventDefault();
        stopRecording();
    });


    // --- Audio Queue Management ---
    class AudioQueue {
        constructor() {
            this.queue = [];
            this.isPlaying = false;
            this.currentAudio = null;
            
            // Order management
            this.pendingAudios = new Map(); // Stores { index: blob }
            this.nextIndex = 0;
            
            // Session management to handle interruptions
            this.currentSessionId = 0;
        }

        startSession() {
            this.stop(); // Clear previous session
            this.currentSessionId++;
            return this.currentSessionId;
        }

        add(audioBlob, index, sessionId) {
            // Discard if from an old session
            if (sessionId !== this.currentSessionId) {
                console.log(`Discarding audio from old session ${sessionId} (current: ${this.currentSessionId})`);
                return;
            }

            // Store in buffer
            this.pendingAudios.set(index, audioBlob);
            // Try to move from buffer to play queue
            this.processBuffer();
        }

        processBuffer() {
            while (this.pendingAudios.has(this.nextIndex)) {
                const blob = this.pendingAudios.get(this.nextIndex);
                this.pendingAudios.delete(this.nextIndex);
                
                const url = URL.createObjectURL(blob);
                this.queue.push(url);
                this.nextIndex++;
            }
            // Trigger playback if not playing
            this.processQueue();
        }

        processQueue() {
            if (this.isPlaying || this.queue.length === 0) return;

            this.isPlaying = true;
            const url = this.queue.shift();
            this.currentAudio = new Audio(url);

            this.currentAudio.onended = () => {
                this.isPlaying = false;
                URL.revokeObjectURL(url);
                this.processQueue();
            };

            this.currentAudio.onerror = (e) => {
                console.error("Audio playback error:", e);
                this.isPlaying = false;
                this.processQueue();
            };

            this.currentAudio.play().catch(e => {
                console.warn("Autoplay blocked or error:", e);
                this.isPlaying = false;
                this.processQueue();
            });
        }

        stop() {
            this.queue = [];
            if (this.currentAudio) {
                this.currentAudio.pause();
                this.currentAudio = null;
            }
            this.isPlaying = false;
            this.pendingAudios.clear();
            this.nextIndex = 0;
            // Note: We don't increment currentSessionId here, only in startSession
        }
    }

    const audioQueue = new AudioQueue();

    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`; // role: 'user' or 'ai'
        msgDiv.textContent = text;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
        return msgDiv;
    }

    async function sendMessage(manualText = null) {
        const text = manualText || chatInput.value.trim();
        if (!text) return;

        // UI Updates
        appendMessage('user', text);
        
        // Start new audio session (invalidates old requests)
        const sessionId = audioQueue.startSession();

        // Only handle input UI if it was a manual user entry (not programmatic)
        if (!manualText) {
            chatInput.value = '';
            chatInput.disabled = true;
            sendBtn.disabled = true;
            chatInput.placeholder = "Thinking...";
        } else {
            showBubble("...");
        }

        let aiMsgDiv = appendMessage('ai', '');
        let fullText = "";
        let ttsBuffer = "";
        let sentenceIndex = 0; // Track sentence order
        const punctuations = /[，。！？；,.!?;:\n]/;

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) throw new Error("Chat failed");

            const reader = response.body.getReader();
            const decoder = new TextDecoder();

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        try {
                            const jsonStr = line.slice(6);
                            if (jsonStr.trim() === "[DONE]") continue; // Standard SSE end
                            
                            const data = JSON.parse(jsonStr);
                            
                            if (data.error) throw new Error(data.error);
                            
                            if (data.content) {
                                const content = data.content;
                                fullText += content;
                                aiMsgDiv.textContent = fullText;
                                showBubble(fullText);
                                chatMessages.scrollTop = chatMessages.scrollHeight;

                                // TTS Buffering Logic
                                ttsBuffer += content;
                                
                                // Check for punctuation
                                let match;
                                while ((match = punctuations.exec(ttsBuffer)) !== null) {
                                    const index = match.index;
                                    const sentence = ttsBuffer.substring(0, index + 1).trim();
                                    ttsBuffer = ttsBuffer.substring(index + 1);
                                    
                                    if (sentence) {
                                        const currentIndex = sentenceIndex++;
                                        // Send to TTS (Async, don't await to keep text streaming)
                                        fetch('/api/tts', {
                                            method: 'POST',
                                            headers: { 'Content-Type': 'application/json' },
                                            body: JSON.stringify({ text: sentence })
                                        })
                                        .then(async res => {
                                            if (!res.ok) {
                                                const errText = await res.text();
                                                throw new Error(`TTS API Error: ${res.status} ${errText}`);
                                            }
                                            return res.blob();
                                        })
                                        .then(blob => {
                                            if (blob.size > 0) {
                                                audioQueue.add(blob, currentIndex, sessionId);
                                            } else {
                                                console.warn("Received empty audio blob for sentence:", sentence);
                                            }
                                        })
                                        .catch(e => console.error("TTS Fetch Error:", e));
                                    }
                                }
                            }
                        } catch (e) {
                            console.error("Stream parse error:", e);
                        }
                    }
                }
            }
            
            // Process remaining buffer
            if (ttsBuffer.trim()) {
                 const currentIndex = sentenceIndex++;
                 fetch('/api/tts', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ text: ttsBuffer.trim() })
                })
                .then(async res => {
                    if (!res.ok) {
                        const errText = await res.text();
                        throw new Error(`TTS API Error: ${res.status} ${errText}`);
                    }
                    return res.blob();
                })
                .then(blob => {
                    if (blob.size > 0) {
                        audioQueue.add(blob, currentIndex, sessionId);
                    }
                })
                .catch(e => console.error("TTS Fetch Error:", e));
            }

        } catch (error) {
            console.error("Chat error:", error);
            aiMsgDiv.textContent += ` [Error: ${error.message}]`;
        } finally {
            if (!manualText) {
                chatInput.disabled = false;
                sendBtn.disabled = false;
                chatInput.placeholder = "Say something...";
                chatInput.focus();
            }
        }
    }

    // Chat Event Listeners
    sendBtn.addEventListener('click', () => sendMessage()); // Wrap in arrow function to avoid passing event object
    chatInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });

    resetBtn.addEventListener('click', async () => {
        if (!confirm("Clear chat history?")) return;
        try {
            await fetch('/api/reset', { method: 'POST' });
            chatMessages.innerHTML = '';
            appendMessage('ai', "Chat history cleared.");
        } catch (e) {
            alert("Failed to reset: " + e.message);
        }
    });

    // Settings Logic
    async function loadSettings() {
        try {
            const res = await fetch('/api/settings');
            const data = await res.json();
            systemPromptInput.value = data.system_prompt;
        } catch (e) {
            console.error("Failed to load settings", e);
        }
    }

    settingsBtn.addEventListener('click', () => {
        loadSettings();
        settingsPanel.classList.remove('hidden');
    });

    closeSettingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('hidden');
    });

    saveSettingsBtn.addEventListener('click', async () => {
        const newPrompt = systemPromptInput.value.trim();
        if (!newPrompt) return;

        try {
            saveSettingsBtn.textContent = "Saving...";
            saveSettingsBtn.disabled = true;
            
            await fetch('/api/settings', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ system_prompt: newPrompt })
            });
            
            alert("Settings saved!");
            settingsPanel.classList.add('hidden');
        } catch (e) {
            alert("Failed to save: " + e.message);
        } finally {
            saveSettingsBtn.textContent = "Save";
            saveSettingsBtn.disabled = false;
        }
    });

    // --- Accordion Logic ---
    function initAccordion() {
        const headers = document.querySelectorAll('.accordion-header');
        
        headers.forEach(header => {
            const item = header.parentElement;
            const id = item.id;
            const icon = header.querySelector('.acc-icon');

            // 1. Accessibility Setup
            header.setAttribute('role', 'button');
            header.setAttribute('tabindex', '0');
            
            // 2. State Restoration from LocalStorage
            // Default: 'acc-model-list' open, 'acc-upload' closed if no history
            let savedState = localStorage.getItem('accordion-' + id);
            
            if (!savedState) {
                // Default initial state
                if (id === 'acc-model-list') savedState = 'open';
                else savedState = 'closed';
            }

            if (savedState === 'open') {
                item.classList.add('active');
                if(icon) icon.textContent = '▼';
                header.setAttribute('aria-expanded', 'true');
            } else {
                item.classList.remove('active');
                if(icon) icon.textContent = '▶';
                header.setAttribute('aria-expanded', 'false');
            }

            // 3. Remove existing listeners (clone)
            const newHeader = header.cloneNode(true);
            header.parentNode.replaceChild(newHeader, header);
            
            // 4. Toggle Logic
            const toggle = () => {
                const isActive = newHeader.parentElement.classList.contains('active');
                const newItem = newHeader.parentElement;
                const newIcon = newHeader.querySelector('.acc-icon');
                
                if (isActive) {
                    // Close
                    newItem.classList.remove('active');
                    if(newIcon) newIcon.textContent = '▶';
                    newHeader.setAttribute('aria-expanded', 'false');
                    localStorage.setItem('accordion-' + id, 'closed');
                } else {
                    // Open
                    newItem.classList.add('active');
                    if(newIcon) newIcon.textContent = '▼';
                    newHeader.setAttribute('aria-expanded', 'true');
                    localStorage.setItem('accordion-' + id, 'open');
                }
            };

            newHeader.addEventListener('click', toggle);
            
            // Keyboard Support
            newHeader.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    toggle();
                }
            });
        });
    }
    
    // Call init
    initAccordion();

    // --- Window Management (Dragging with Transform & Throttle) ---
    
    // Throttle Helper
    function throttle(func, limit) {
        let inThrottle;
        return function() {
            const args = arguments;
            const context = this;
            if (!inThrottle) {
                func.apply(context, args);
                inThrottle = true;
                setTimeout(() => inThrottle = false, limit);
            }
        }
    }

    function makeDraggable(windowId) {
        const win = document.getElementById(windowId);
        const header = win.querySelector('.window-header');
        const minimizeBtn = win.querySelector('.minimize-btn');
        const opacitySlider = win.querySelector('.opacity-slider');
        
        let isDragging = false;
        let startX, startY;
        
        // We store the current translation
        let translateX = 0;
        let translateY = 0;

        // 1. Dragging Logic (Transform based)
        header.addEventListener('mousedown', (e) => {
            if (window.innerWidth < 768) return; // Disable dragging on mobile
            if (e.target === minimizeBtn || e.target === opacitySlider) return;

            isDragging = true;
            startX = e.clientX;
            startY = e.clientY;
            
            win.classList.add('dragging');
            win.style.zIndex = 1001;
            document.body.style.userSelect = 'none';
        });

        window.addEventListener('mousemove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); 

            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            translateX += dx;
            translateY += dy;

            win.style.transform = `translate(${translateX}px, ${translateY}px)`;

            startX = e.clientX;
            startY = e.clientY;
        });

        window.addEventListener('mouseup', () => {
            if (isDragging) {
                isDragging = false;
                win.classList.remove('dragging');
                // Keep zIndex high or reset? Let's keep it.
                document.body.style.userSelect = '';
            }
        });
        
        // Touch support
        header.addEventListener('touchstart', (e) => {
             if (e.target === minimizeBtn || e.target === opacitySlider) return;
             isDragging = true;
             const touch = e.touches[0];
             startX = touch.clientX;
             startY = touch.clientY;
             win.classList.add('dragging');
             win.style.zIndex = 1001;
        }, {passive: false});

        window.addEventListener('touchmove', (e) => {
            if (!isDragging) return;
            e.preventDefault(); 
            const touch = e.touches[0];
            const dx = touch.clientX - startX;
            const dy = touch.clientY - startY;
            translateX += dx;
            translateY += dy;
            win.style.transform = `translate(${translateX}px, ${translateY}px)`;
            startX = touch.clientX;
            startY = touch.clientY;
        }, {passive: false});

        window.addEventListener('touchend', () => {
             isDragging = false;
             win.classList.remove('dragging');
        });

        // 2. Minimize Logic
        let isMinimized = false;
        
        minimizeBtn.addEventListener('click', () => {
            isMinimized = !isMinimized;
            if (isMinimized) {
                win.classList.add('minimized');
                minimizeBtn.textContent = '+';
            } else {
                win.classList.remove('minimized');
                minimizeBtn.textContent = '-';
            }
        });

        // 3. Opacity Logic
        opacitySlider.addEventListener('input', (e) => {
            const opacity = e.target.value;
            win.style.background = `rgba(0, 0, 0, ${opacity})`;
        });
    }

    // Initialize Windows
    makeDraggable('ui-container');
    makeDraggable('chat-container');

    // --- Mobile Bottom Sheet Logic ---
    let mobileInitialized = false;

    function initMobileSheets() {
        if (mobileInitialized) return;
        
        const mobileModelsBtn = document.getElementById('mobile-models-btn');
        const mobileChatBtn = document.getElementById('mobile-chat-btn');
        const mobileOverlay = document.getElementById('mobile-overlay');
        const uiContainer = document.getElementById('ui-container');
        const chatContainer = document.getElementById('chat-container');
        const uiHeader = uiContainer.querySelector('.window-header');
        const chatHeader = chatContainer.querySelector('.window-header');

        if (!mobileModelsBtn || !mobileChatBtn) return;

        function closeAllSheets() {
            uiContainer.classList.remove('sheet-active');
            chatContainer.classList.remove('sheet-active');
            mobileOverlay.classList.remove('active');
            mobileModelsBtn.classList.remove('active');
            mobileChatBtn.classList.remove('active');
        }

        mobileModelsBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasActive = uiContainer.classList.contains('sheet-active');
            closeAllSheets();
            if (!wasActive) {
                uiContainer.classList.add('sheet-active');
                mobileOverlay.classList.add('active');
                mobileModelsBtn.classList.add('active');
            }
        });

        mobileChatBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const wasActive = chatContainer.classList.contains('sheet-active');
            closeAllSheets();
            if (!wasActive) {
                chatContainer.classList.add('sheet-active');
                mobileOverlay.classList.add('active');
                mobileChatBtn.classList.add('active');
            }
        });

        mobileOverlay.addEventListener('click', closeAllSheets);

        // Swipe Down Logic
        let startY = 0;
        const swipeThreshold = 50;

        function handleTouchStart(e) {
            startY = e.touches[0].clientY;
        }

        function handleTouchEnd(e) {
            const endY = e.changedTouches[0].clientY;
            if (endY - startY > swipeThreshold) {
                closeAllSheets();
            }
        }

        // Attach swipe listeners to headers
        uiHeader.addEventListener('touchstart', handleTouchStart, {passive: true});
        uiHeader.addEventListener('touchend', handleTouchEnd, {passive: true});
        
        chatHeader.addEventListener('touchstart', handleTouchStart, {passive: true});
        chatHeader.addEventListener('touchend', handleTouchEnd, {passive: true});

        mobileInitialized = true;
        console.log("Mobile interaction initialized");
    }

    // Initialize if currently mobile
    if (window.innerWidth < 768) {
        initMobileSheets();
    }

    // Check on resize
    window.addEventListener('resize', () => {
        if (window.innerWidth < 768) {
            initMobileSheets();
        }
    });

})();
