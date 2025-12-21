# Live2D Viewer & Chat Assistant API 文档

本文档详细描述了后端服务提供的 RESTful API 和 WebSocket 接口。

## 目录

*   [模型管理](#1-模型管理)
*   [对话交互](#2-对话交互)
*   [系统设置](#3-系统设置)
*   [实时语音识别 (ASR)](#4-实时语音识别-asr)

---

## 1. 模型管理

### 获取模型列表

*   **URL**: `/api/models`
*   **Method**: `GET`
*   **描述**: 扫描服务器上的 `models` 目录，返回所有可用的 Live2D 模型。
*   **响应示例**:
    ```json
    {
        "models": [
            {
                "name": "shizuku",
                "url": "/models/shizuku/shizuku.model.json",
                "filename": "shizuku.model.json"
            },
            {
                "name": "wanko",
                "url": "/models/wanko/wanko.model.json",
                "filename": "wanko.model.json"
            }
        ]
    }
    ```

### 上传模型

*   **URL**: `/api/upload`
*   **Method**: `POST`
*   **Content-Type**: `multipart/form-data`
*   **参数**:
    *   `file`: (Required) `.zip` 格式的模型压缩包。
    *   `custom_name`: (Optional) 自定义模型目录名称（仅允许字母、数字、下划线）。
*   **描述**: 上传并解压 Live2D 模型。
*   **响应示例**:
    ```json
    {
        "message": "Model my_model uploaded and extracted successfully"
    }
    ```

### 删除模型

*   **URL**: `/api/models/{model_name}`
*   **Method**: `DELETE`
*   **描述**: 删除指定的模型目录。
*   **响应示例**:
    ```json
    {
        "message": "Model shizuku deleted successfully"
    }
    ```

---

## 2. 对话交互

### 发送对话 (流式)

*   **URL**: `/api/chat`
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **请求体**:
    ```json
    {
        "text": "你好，今天天气怎么样？"
    }
    ```
*   **描述**: 发送用户输入，获取 AI 的流式回复（Server-Sent Events）。
*   **响应格式**: `text/event-stream`
    *   数据流格式: `data: {"content": "..."}`
    *   结束标识: `data: [DONE]` (部分实现可能直接断开流)

### 文本转语音 (TTS)

*   **URL**: `/api/tts`
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **请求体**:
    ```json
    {
        "text": "这是一段测试语音。"
    }
    ```
*   **描述**: 将文本转换为语音音频流。
*   **响应**: 二进制音频流 (通常为 MP3 或 WAV 格式)。

### 重置对话

*   **URL**: `/api/reset`
*   **Method**: `POST`
*   **描述**: 清空后端的对话历史上下文。
*   **响应示例**:
    ```json
    {
        "message": "Chat history cleared"
    }
    ```

---

## 3. 系统设置

### 获取当前设置

*   **URL**: `/api/settings`
*   **Method**: `GET`
*   **描述**: 获取当前的系统提示词（Persona）。
*   **响应示例**:
    ```json
    {
        "system_prompt": "你是一个可爱的二次元少女..."
    }
    ```

### 更新设置

*   **URL**: `/api/settings`
*   **Method**: `POST`
*   **Content-Type**: `application/json`
*   **请求体**:
    ```json
    {
        "system_prompt": "你是一个严肃的百科全书助手。"
    }
    ```
*   **描述**: 更新 AI 的人设。

---

## 4. 实时语音识别 (ASR)

### WebSocket 接口

*   **URL**: `/ws/asr`
*   **Protocol**: `WebSocket`
*   **描述**: 提供低延迟的实时语音转文字服务。

### 交互协议

1.  **建立连接**: 客户端连接到 `ws://<host>:<port>/ws/asr`。
2.  **发送音频**:
    *   客户端持续发送 **二进制帧 (Binary Frames)**。
    *   格式要求: 16-bit PCM, 单声道, 16000Hz 采样率。
3.  **接收中间结果**:
    *   服务端实时返回 JSON 文本帧：
        ```json
        {
            "text": "正在识别的内容...",
            "is_final": false
        }
        ```
4.  **结束录音**:
    *   客户端发送控制帧（JSON 文本）：
        ```json
        {
            "type": "stop"
        }
        ```
5.  **接收最终结果**:
    *   服务端处理完剩余缓冲后，返回最终结果：
        ```json
        {
            "text": "最终完整的识别内容。",
            "is_final": true
        }
        ```
6.  **关闭连接**: 服务端或客户端断开 WebSocket 连接。

### 错误处理

如果发生错误，服务端会发送包含 `error` 字段的 JSON 消息：
```json
{
    "error": "Detailed error message here"
}
```
