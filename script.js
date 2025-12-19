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

    function appendMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `message ${role}`; // role: 'user' or 'ai'
        msgDiv.textContent = text;
        chatMessages.appendChild(msgDiv);
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    async function sendMessage(manualText = null) {
        const text = manualText || chatInput.value.trim();
        if (!text) return;

        // UI Updates
        appendMessage('user', text);
        
        // Only handle input UI if it was a manual user entry (not programmatic)
        if (!manualText) {
            chatInput.value = '';
            chatInput.disabled = true;
            sendBtn.disabled = true;
            chatInput.placeholder = "Thinking...";
        } else {
            // For touch events (manualText), show immediate feedback in bubble
            showBubble("...");
        }

        try {
            const response = await fetch('/api/chat', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ text: text })
            });

            if (!response.ok) {
                const err = await response.json();
                throw new Error(err.detail || "Chat failed");
            }

            const data = await response.json();
            appendMessage('ai', data.reply);
            showBubble(data.reply);

        } catch (error) {
            console.error("Chat error:", error);
            appendMessage('ai', `[Error: ${error.message}]`);
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
    sendBtn.addEventListener('click', sendMessage);
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

})();
