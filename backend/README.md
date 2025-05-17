# AIMonitor 后端

## 启动方法

1. 进入本目录：
   ```bash
   cd backend
   ```
2. 安装依赖：
   ```bash
   pip install -r requirements.txt
   ```
3. 启动服务：
   ```bash
   uvicorn main:app --reload
   ```

API端口默认8000，WebSocket地址为 /ws/{training_id}。
