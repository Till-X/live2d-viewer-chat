from fastapi import FastAPI, Request, File, UploadFile, HTTPException, Form
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, StreamingResponse
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
import json
from services.tts_service import tts_service
from services.llm_service import llm_service
from services.asr_service import asr_service
import yaml
from fastapi import WebSocket, WebSocketDisconnect

# Load Config
def load_config():
    config_path = "config.yaml"
    if os.path.exists(config_path):
        with open(config_path, 'r', encoding='utf-8') as f:
            return yaml.safe_load(f)
    return {}

app_config = load_config()
server_config = app_config.get('server', {})
# LLM config is now handled in llm_service

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

class ChatRequest(BaseModel):
    text: str

class TTSRequest(BaseModel):
    text: str

class SettingsRequest(BaseModel):
    system_prompt: str

@app.post("/api/tts")
async def tts_endpoint(request: TTSRequest):
    try:
        audio_data = await tts_service.synthesize(request.text)
        # Return audio as binary response
        return StreamingResponse(
            iter([audio_data]), 
            media_type="audio/mp3"
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chat")
async def chat_endpoint(request: ChatRequest):
    user_input = request.text
    
    async def generate():
        try:
            async for content in llm_service.chat_stream(user_input):
                yield f"data: {json.dumps({'content': content})}\n\n"
        except Exception as e:
            print(f"Stream Error: {e}")
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")

@app.get("/api/settings")
async def get_settings():
    return {"system_prompt": llm_service.system_prompt}

@app.post("/api/settings")
async def update_settings(request: SettingsRequest):
    llm_service.update_system_prompt(request.system_prompt)
    return {"message": "Settings updated", "system_prompt": llm_service.system_prompt}

@app.post("/api/reset")
async def reset_chat():
    llm_service.clear_history()
    return {"message": "Chat history cleared"}

@app.websocket("/ws/asr")
async def websocket_asr(websocket: WebSocket):
    await websocket.accept()
    print("ASR WebSocket Connected")
    
    try:
        # Create an async generator to yield chunks from websocket
        async def audio_generator():
            try:
                while True:
                    # Receive can be bytes (audio) or text (control)
                    message = await websocket.receive()
                    
                    if "bytes" in message:
                        yield message["bytes"]
                    elif "text" in message:
                        try:
                            data = json.loads(message["text"])
                            if data.get("type") == "stop":
                                break
                        except:
                            pass
                    
                    if message["type"] == "websocket.disconnect":
                        break
                        
            except WebSocketDisconnect:
                pass
            except Exception as e:
                # Handle 1007 error gracefully (invalid payload)
                print(f"WS Recv Error: {e}")

        # Process via ASR Service
        last_text = ""
        async for result in asr_service.stream_asr(audio_generator()):
            try:
                if "error" in result:
                    await websocket.send_json(result)
                    break
                
                if "text" in result:
                    last_text = result["text"]
                    
                await websocket.send_json(result)
            except Exception as e:
                # If connection closed, stop sending
                print(f"WS Send Error: {e}")
                break
        
        # Send final completion signal
        try:
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_json({"text": last_text, "is_final": True})
        except Exception as e:
            print(f"WS Final Send Error: {e}")
            
    except WebSocketDisconnect:
        print("ASR WebSocket Disconnected by Client")
    except Exception as e:
        print(f"ASR WS Error: {e}")
        try:
            # Only send error if connection is still open
            if websocket.client_state.name == "CONNECTED":
                await websocket.send_json({"error": str(e)})
        except:
            pass
    finally:
        try:
            # Only close if not already closed
            if websocket.client_state.name == "CONNECTED":
                await websocket.close()
        except:
            pass
        print("ASR WebSocket Closed")

# --- Static Files & Root ---

@app.get("/")
async def read_root():
    """
    Serve the index.html page at root.
    """
    return FileResponse("static/index.html")

# Mount the static directory to serve static files (script.js, style.css, etc.)
app.mount("/static", StaticFiles(directory="static"), name="static")

if __name__ == "__main__":
    import uvicorn
    # Run the server
    host = server_config.get("host", "0.0.0.0")
    port = server_config.get("port", 8000)
    print(f"Starting server on {host}:{port}")
    uvicorn.run("main:app", host=host, port=port, reload=True)
