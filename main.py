from fastapi import FastAPI, Request
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from fastapi.middleware.cors import CORSMiddleware
import os

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

if __name__ == "__main__":
    import uvicorn
    # Run the server
    # You can access the site at http://127.0.0.1:8000
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
