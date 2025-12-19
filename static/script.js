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

    // 5. Load Sample Model
    // Using Haru model from a public CDN for demonstration
    const sampleModelUrl = "/models/shizuku/shizuku.model.json";
    
    // You can also use a local model if you put it in the 'models' folder
    // const localModelUrl = "/models/my_model/my_model.model3.json";

    await loadLive2DModel(sampleModelUrl);

})();
