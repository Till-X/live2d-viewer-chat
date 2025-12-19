from fastapi import FastAPI, Request, File, UploadFile, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import os
import shutil
import zipfile
import re
from pathlib import Path
from typing import List

app = FastAPI()

# Enable CORS (Cross-Origin Resource Sharing)
# Useful if you load models from other ports or domains during dev
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Ensure models directory exists
MODELS_DIR = Path("models")
MODELS_DIR.mkdir(exist_ok=True)

# Mount static directories
# 'static' for js/css
app.mount("/static", StaticFiles(directory="static"), name="static")
# 'models' for Live2D model files
app.mount("/models", StaticFiles(directory="models"), name="models")

# Templates
templates = Jinja2Templates(directory="templates")

@app.get("/")
async def read_root(request: Request):
    """
    Serve the index.html page.
    """
    return templates.TemplateResponse("index.html", {"request": request})

@app.get("/api/models")
async def get_models():
    """
    Scan the models directory and return a list of available models.
    Returns one model per subdirectory in 'models/'.
    """
    models = []
    
    # Iterate over immediate subdirectories of MODELS_DIR
    # These subdirectories represent the "Model Name" (or ID) we assigned during upload
    if MODELS_DIR.exists():
        for item in MODELS_DIR.iterdir():
            if item.is_dir():
                model_name = item.name
                
                # Search for a .model.json or .model3.json file recursively within this folder
                model_file_path = None
                for root, dirs, files in os.walk(item):
                    for file in files:
                        if file.endswith(".model.json") or file.endswith(".model3.json"):
                            model_file_path = Path(root) / file
                            break # Found one, break inner loop
                    if model_file_path:
                        break # Found one, break outer loop
                
                if model_file_path:
                    # Calculate relative path for URL
                    relative_path = model_file_path.relative_to(MODELS_DIR)
                    url = f"/models/{relative_path}"
                    
                    models.append({
                        "name": model_name, # Use the top-level folder name as the display name
                        "url": url,
                        "filename": model_file_path.name
                    })
    
    # Sort models by name for consistent display
    models.sort(key=lambda x: x["name"])
    
    return {"models": models}

@app.post("/api/upload")
async def upload_model(
    file: UploadFile = File(...),
    custom_name: str = Form(None)
):
    """
    Upload and extract a Live2D model zip file.
    """
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip files are allowed")
    
    # Determine folder name
    if custom_name:
        # Validate custom name
        if not re.match(r"^[a-zA-Z0-9_]{2,50}$", custom_name):
             raise HTTPException(status_code=400, detail="Invalid model name. Use 2-50 characters: letters, numbers, underscores.")
        folder_name = custom_name
    else:
        folder_name = file.filename[:-4]
        # Basic sanitization for default name
        folder_name = re.sub(r"[^a-zA-Z0-9_]", "_", folder_name)

    target_dir = MODELS_DIR / folder_name
    
    # Clean up if exists (optional, but good for re-uploads)
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    
    # Save the zip file temporarily
    zip_path = target_dir / file.filename
    try:
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        # Extract the zip file
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(target_dir)
            
        # Cleanup: Remove the zip file
        os.remove(zip_path)
        
        # Cleanup: Remove __MACOSX if it exists
        macosx_dir = target_dir / "__MACOSX"
        if macosx_dir.exists():
            shutil.rmtree(macosx_dir)
            
        return {"message": f"Model {folder_name} uploaded and extracted successfully"}
        
    except Exception as e:
        # If anything fails, clean up the directory
        if target_dir.exists():
            shutil.rmtree(target_dir)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/models/{model_name}")
async def delete_model(model_name: str):
    """
    Delete a model by its directory name.
    """
    # Basic validation to prevent directory traversal
    if not re.match(r"^[a-zA-Z0-9_]{2,50}$", model_name):
         raise HTTPException(status_code=400, detail="Invalid model name format.")

    target_dir = MODELS_DIR / model_name
    
    if not target_dir.exists():
        raise HTTPException(status_code=404, detail="Model not found")
        
    try:
        shutil.rmtree(target_dir)
        return {"message": f"Model {model_name} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    # Run the server
    # You can access the site at http://127.0.0.1:8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
