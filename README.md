# Live2D Viewer & Chat Assistant

![Live2D Viewer](./docs/assets/images/Live2D+Viewer.png)

> 一个集成了 Live2D 模型展示与 AI 智能对话功能的 Web 应用。

本项目提供了一个轻量级的 Web 界面，允许用户上传、查看 Live2D 模型，并与拥有自定义人设的 AI 助手进行实时对话。前端采用 PixiJS 和 Live2D SDK，后端基于 FastAPI 构建，支持 OpenAI 兼容接口（如 DeepSeek, Volcengine Ark 等）。

## ✨ 关键特性

*   **Live2D 模型展示**: 支持 Cubism 2.0 和 4.0 版本的 Live2D 模型加载与交互（视线跟随、点击反馈）。
*   **AI 智能对话**: 集成 LLM（大语言模型），模型不仅能对话，还能根据对话内容触发动作。
*   **TTS 语音合成**: 集成火山引擎 TTS，支持流式语音播放（边生成边播放），实现自然的对话体验。
*   **自定义人设**: 用户可以随时调整 AI 的系统提示词（System Prompt），打造个性化虚拟助手。
*   **一键部署**: 前后端分离架构但统一托管，支持 Docker 或直接 Python 脚本快速部署。
*   **模型管理**: 提供简单的 Web 界面进行模型的上传、切换和删除。

---

## 🚀 快速开始

### 系统要求

*   **操作系统**: Windows, macOS, 或 Linux (Ubuntu/CentOS)
*   **Python**: 3.8 或更高版本
*   **浏览器**: 现代浏览器 (Chrome, Firefox, Edge, Safari)

### 安装步骤

1.  **克隆项目**
    ```bash
    git clone <your-repo-url>
    cd live2d-viewer
    ```

2.  **创建虚拟环境 (推荐使用 Conda)**
    ```bash
    # 创建名为 live2d 的环境，指定 python 版本
    conda create -n live2d python=3.10 -y
    
    # 激活环境
    conda activate live2d
    ```

3.  **安装依赖**
    ```bash
    pip install -r requirements.txt
    ```

4.  **配置环境**
    请参考下文 [配置文件](#配置文件) 章节，创建并编辑 `config.yaml` 文件。

5.  **启动服务**
    ```bash
    python main.py
    ```
    或者在后台运行（Linux生产环境）：
    ```bash
    nohup python main.py > server.log 2>&1 &
    ```

### 基本用法

1.  打开浏览器访问 `http://localhost:8000`。
2.  **上传模型**: 点击右侧面板的 "Upload .zip" 按钮，上传包含 Live2D 模型文件的 zip 包。
3.  **切换模型**: 上传成功后，点击列表中的模型名称即可切换。
4.  **对话**: 在左下角聊天框输入内容并发送，AI 将根据设定的人设进行回复。

---

## 📖 详细文档

### 功能说明

*   **模型查看器**: 基于 `pixi-live2d-display`，支持拖拽、缩放模型。
*   **聊天系统**:
    *   后端维护对话历史上下文（默认保留最近 20 轮）。
    *   支持流式或非流式响应（当前版本支持流式输出 + TTS 同步播放）。
    *   `/api/chat` 接口负责处理对话逻辑（SSE 流式）。
    *   `/api/tts` 接口负责文本转语音。
*   **设置面板**:
    *   可以实时修改 `system_prompt`，改变 AI 的说话语气和性格。
    *   设置保存在内存中，重启服务后重置。

### API 文档

后端提供 RESTful API，主要端点如下：

| 方法 | 路径 | 描述 |
| :--- | :--- | :--- |
| `GET` | `/` | 返回主页 (index.html) |
| `GET` | `/api/models` | 获取所有已上传的模型列表 |
| `POST` | `/api/upload` | 上传并解压 Live2D 模型 zip 包 |
| `DELETE`| `/api/models/{name}`| 删除指定模型 |
| `POST` | `/api/chat` | 发送用户消息获取 AI 回复 (SSE Stream) |
| `POST` | `/api/tts` | 文本转语音接口 (Streaming Audio) |
| `GET` | `/api/settings` | 获取当前系统提示词 (System Prompt) |
| `POST` | `/api/settings` | 更新系统提示词 |
| `POST` | `/api/reset` | 清空对话历史 |

### 配置文件

项目使用 `config.yaml` 进行统一配置管理。请复制 `config.example.yaml` 为 `config.yaml` 并填入您的实际配置。

1.  **复制配置文件**
    ```bash
    cp config.example.yaml config.yaml
    ```

2.  **编辑 `config.yaml`**
    ```yaml
    # Server Configuration
    server:
      host: "0.0.0.0"
      port: 8000
    
    # LLM Configuration
    llm:
      api_key: "YOUR_ARK_API_KEY"
      ...
    
    # TTS Configuration
    tts:
      appid: "YOUR_APP_ID"
      ...
    ```

---

## 🛠 开发指南

### 开发环境搭建

1.  确保已安装 Python 3.8+。
2.  安装开发依赖（本项目直接使用 `requirements.txt`）。
3.  建议使用 VS Code 或 PyCharm 进行开发。

### 目录结构

```text
live2d-viewer/
├── main.py             # [后端] FastAPI 入口
├── config.yaml         # [配置] 配置文件 (不公开)
├── services/           # [后端] 业务逻辑层
│   ├── asr_service.py
│   ├── tts_service.py
│   └── llm_service.py
├── static/             # [前端] 静态资源目录
│   ├── index.html      # 页面入口
│   ├── script.js       # 交互逻辑
│   ├── style.css       # 样式文件
│   ├── audio-processor.js # 音频处理 Worklet
│   └── core_libs/      # Live2D SDK 等依赖
├── docs/               # [文档] 文档图片资源
├── models/             # [数据] 上传的模型文件存储
└── requirements.txt    # Python 依赖
```

### 代码贡献

1.  Fork 本仓库。
2.  创建一个新的特性分支 (`git checkout -b feature/AmazingFeature`)。
3.  提交您的更改 (`git commit -m 'Add some AmazingFeature'`)。
4.  推送到分支 (`git push origin feature/AmazingFeature`)。
5.  开启一个 Pull Request。

---

## 📄 其他信息

### 许可证

本项目采用 [MIT License](LICENSE) 许可证。

### 联系方式

如有问题或建议，请提交 Issue 或联系开发者：
*   Email: tang18508416901@outlook.com

### 致谢

*   [FastAPI](https://fastapi.tiangolo.com/) - 现代、快速的 Web 框架
*   [PixiJS](https://pixijs.com/) - 强大的 2D 渲染引擎
*   [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) - PixiJS 的 Live2D 插件
*   [OpenAI Python Library](https://github.com/openai/openai-python) - LLM 客户端库
