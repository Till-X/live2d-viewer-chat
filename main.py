from fastapi import FastAPI, Request, File, UploadFile, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import shutil
import zipfile
import re
from pathlib import Path
from typing import List, Optional
import openai
from openai import AsyncOpenAI

app = FastAPI()

# Enable CORS (Cross-Origin Resource Sharing)
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

# Mount models directory (Specific path first)
app.mount("/models", StaticFiles(directory="models"), name="models")

# --- API Routes ---

@app.get("/api/models")
async def get_models():
    """
    Scan the models directory and return a list of available models.
    Returns one model per subdirectory in 'models/'.
    """
    models = []
    
    # Iterate over immediate subdirectories of MODELS_DIR
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
                        "name": model_name,
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
        if not re.match(r"^[a-zA-Z0-9_]{2,50}$", custom_name):
             raise HTTPException(status_code=400, detail="Invalid model name. Use 2-50 characters: letters, numbers, underscores.")
        folder_name = custom_name
    else:
        folder_name = file.filename[:-4]
        folder_name = re.sub(r"[^a-zA-Z0-9_]", "_", folder_name)

    target_dir = MODELS_DIR / folder_name
    
    if target_dir.exists():
        shutil.rmtree(target_dir)
    target_dir.mkdir(parents=True, exist_ok=True)
    
    zip_path = target_dir / file.filename
    try:
        with open(zip_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        with zipfile.ZipFile(zip_path, 'r') as zip_ref:
            zip_ref.extractall(target_dir)
            
        os.remove(zip_path)
        
        macosx_dir = target_dir / "__MACOSX"
        if macosx_dir.exists():
            shutil.rmtree(macosx_dir)
            
        return {"message": f"Model {folder_name} uploaded and extracted successfully"}
        
    except Exception as e:
        if target_dir.exists():
            shutil.rmtree(target_dir)
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/models/{model_name}")
async def delete_model(model_name: str):
    """
    Delete a model by its directory name.
    """
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

# --- Chat & LLM Integration ---

api_key = os.environ.get("ARK_API_KEY", "1dfed9d9-db49-4985-b4e9-1dcb090e5e93")
client = AsyncOpenAI(
    base_url="https://ark.cn-beijing.volces.com/api/v3",
    api_key=api_key
)

class GlobalConfig:
    def __init__(self):
        self.system_prompt = "你是一个可爱的二次元少女，说话语气活泼，喜欢用emoji。"
        self.history = [] 

config = GlobalConfig()

class ChatRequest(BaseModel):
    text: str

class SettingsRequest(BaseModel):
    system_prompt: str

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    user_input = request.text
    config.history.append({"role": "user", "content": user_input})
    
    messages = [
        {"role": "system", "content": config.system_prompt}
    ] + config.history
    
    try:
        if api_key == "YOUR_API_KEY":
            import asyncio
            await asyncio.sleep(1)
            ai_response = f"This is a mock response because no ARK_API_KEY is set. You said: {user_input} 😸"
        else:
            completion = await client.chat.completions.create(
                model="deepseek-v3-1-terminus",
                messages=messages
            )
            ai_response = completion.choices[0].message.content
            
        config.history.append({"role": "assistant", "content": ai_response})
        
        if len(config.history) > 20:
            config.history = config.history[-20:]
            
        return {"reply": ai_response}
        
    except Exception as e:
        config.history.pop() 
        print(f"Error calling OpenAI/Ark: {e}")
        raise HTTPException(status_code=500, detail=f"LLM Error: {str(e)}")

@app.get("/api/settings")
async def get_settings():
    return {"system_prompt": config.system_prompt}

@app.post("/api/settings")
async def update_settings(request: SettingsRequest):
    config.system_prompt = request.system_prompt
    return {"message": "Settings updated", "system_prompt": config.system_prompt}

@app.post("/api/reset")
async def reset_chat():
    config.history = []
    return {"message": "Chat history cleared"}

# --- Static Files & Root ---

@app.get("/")
async def read_root():
    """
    Serve the index.html page at root.
    """
    return FileResponse("index.html")

# Mount the root directory to serve static files (script.js, style.css, etc.)
# WARNING: This exposes all files in the root directory (including main.py).
# Ensure sensitive files are excluded or handled securely in production.
app.mount("/", StaticFiles(directory=".", html=True), name="root")

if __name__ == "__main__":
    import uvicorn
    # Run the server on 0.0.0.0 to make it accessible externally
    print("Starting server on 0.0.0.0:8000")
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
