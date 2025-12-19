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

            // 5. Generic Hit Area Detection
            // Listen for pointertap (click/touch) events on the model
            // Changed to pointerdown for immediate feedback
            model.on('pointerdown', (event) => {
                // Get the global position of the interaction (screen coordinates)
                const point = event.data.global;
                
                // Convert Global coordinates to Model Local coordinates
                // This accounts for the model's position, scale, and rotation on the stage
                const localPoint = model.toLocal(point);

                console.log(`[Debug] Click at Global(${point.x.toFixed(0)}, ${point.y.toFixed(0)}) -> Local(${localPoint.x.toFixed(0)}, ${localPoint.y.toFixed(0)})`);
                
                // Perform hit testing using the library's built-in method
                // hitTest(x, y) expects local coordinates and returns an array of hit area IDs
                const hitAreaIds = model.hitTest(localPoint.x, localPoint.y);
                
                console.log("[Debug] HitTest Result:", hitAreaIds);

                // Output the results
                if (hitAreaIds && hitAreaIds.length > 0) {
                    console.log('%c Hit Area:', 'color: #00ff00; font-weight: bold;', hitAreaIds);
                }
            });

            // Optional: Listen to the built-in 'hit' event for comparison
            // This event is triggered by the library's auto-interaction system
            model.on('hit', (hitAreas) => {
                 console.log('%c Built-in Hit Event:', 'color: cyan;', hitAreas);
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
        const modelWidth = bounds.width;
        const modelHeight = bounds.height;

        // Get screen size
        const screenWidth = app.screen.width;
        const screenHeight = app.screen.height;

        // Calculate scale to fit 80% of the screen height (or width if mobile)
        // We usually prioritize height for standing characters
        let scale = Math.min(
            (screenWidth * 0.8) / modelWidth,
            (screenHeight * 0.8) / modelHeight
        );

        // Apply scale
        model.scale.set(scale, scale);

        // Center the model
        // We need to account for the anchor or pivot. 
        // pixi-live2d-display models usually have (0,0) at top-left by default.
        model.x = (screenWidth - model.width) / 2;
        
        // Align bottom of model to near bottom of screen? Or center?
        // Let's center vertically for now.
        model.y = (screenHeight - model.height) / 2;

        console.log(`Model scaled to ${scale.toFixed(2)} and centered at (${model.x.toFixed(0)}, ${model.y.toFixed(0)})`);
    }

    // Handle Window Resize
    window.addEventListener('resize', () => {
        if (app.stage.children.length > 0) {
            fitModelToScreen(app.stage.children[0]);
        }
    });

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

})();
