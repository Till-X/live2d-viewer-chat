# Live2D Web Viewer

这是一个基于 Web 的 Live2D 模型查看器，使用 PixiJS 和 FastAPI 构建。它支持加载和展示 Live2D Cubism 2.1 和 4.0 模型，并实现了自动缩放、居中显示以及视线跟随鼠标的基础交互功能。

## 技术栈 (Tech Stack)

*   **前端 (Frontend):**
    *   HTML5 / CSS3
    *   JavaScript (ES6 Modules)
    *   **PixiJS (v7)**: 渲染引擎
    *   **pixi-live2d-display**: Live2D 加载与渲染插件
*   **后端 (Backend):**
    *   **Python (FastAPI)**: 静态文件服务器 (处理 CORS 和 API 扩展)

## 项目结构 (Project Structure)

```
/
├── models/               # 存放 Live2D 模型资源 (.model3.json 等文件)
├── static/
│   ├── script.js         # 前端核心逻辑 (模型加载、交互)
│   └── style.css         # 样式文件
├── templates/
│   └── index.html        # 前端主页模板
├── main.py               # FastAPI 后端入口文件
├── requirements.txt      # Python 依赖列表
└── README.md             # 项目说明文档
```

## 快速开始 (Quick Start)

### 1. 环境准备 (使用 Conda)

推荐使用 Conda 创建独立的虚拟环境，以确保 Python 版本一致性并避免依赖冲突。

```bash
# 1. 创建名为 live2d-viewer 的虚拟环境，指定 Python 3.9
conda create -n live2d-viewer python=3.9

# 2. 激活环境
conda activate live2d-viewer
```

### 2. 安装依赖

在激活的虚拟环境中，运行以下命令安装项目依赖：

```bash
pip install -r requirements.txt
```

### 3. 启动服务器

运行以下命令启动本地开发服务器：

```bash
python main.py
```

或者直接使用 `uvicorn` 命令：

```bash
uvicorn main:app --reload
```

服务器启动后，控制台会显示访问地址，通常为：[http://127.0.0.1:8000](http://127.0.0.1:8000)

### 3. 查看模型

打开浏览器访问 `http://127.0.0.1:8000`。
默认情况下，页面会加载一个示例的 Live2D 模型（Haru）。

## 如何添加自定义模型

1.  将你的 Live2D 模型文件夹放入 `models/` 目录中。
    *   确保模型文件夹包含 `.model3.json` (Cubism 4) 或 `model.json` (Cubism 2) 以及相关的纹理和动作文件。
2.  修改 `static/script.js` 文件中的 `sampleModelUrl` 变量，将其指向你的本地模型路径。

    例如，如果你的模型文件位于 `models/my_character/my_character.model3.json`，则修改代码如下：

    ```javascript
    // static/script.js
    
    // ...
    const sampleModelUrl = "/models/my_character/my_character.model3.json"; 
    await loadLive2DModel(sampleModelUrl);
    // ...
    ```

## 功能特性

*   **模型自适应**: 自动根据屏幕大小缩放模型，并将其居中显示。
*   **视线跟随**: 模型的头部和眼睛会跟随鼠标移动。
*   **兼容性**: 支持 Cubism 2.1 和 Cubism 4.0 模型格式。

## 许可证

MIT License
