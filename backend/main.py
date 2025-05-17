from fastapi import FastAPI, WebSocket, WebSocketDisconnect, Request, Query
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, root_validator
from typing import Dict, List, Optional
import asyncio
from datetime import datetime
from collections import deque

app = FastAPI()

origins = ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# 内存存储订阅和最新数据
class ConnectionManager:
    def __init__(self):
        self.active_connections: Dict[str, List[WebSocket]] = {}
        self.latest_data: Dict[str, dict] = {}
        self.history_data: Dict[str, deque] = {}  # 新增：每个training_id保存最近10条

    async def connect(self, training_id: str, websocket: WebSocket):
        await websocket.accept()
        if training_id not in self.active_connections:
            self.active_connections[training_id] = []
        self.active_connections[training_id].append(websocket)
        # 新连接推送最近10条历史数据
        if training_id in self.history_data:
            for d in self.history_data[training_id]:
                await websocket.send_json(d)
        elif training_id in self.latest_data:
            await websocket.send_json(self.latest_data[training_id])

    def disconnect(self, training_id: str, websocket: WebSocket):
        if training_id in self.active_connections:
            self.active_connections[training_id].remove(websocket)
            if not self.active_connections[training_id]:
                del self.active_connections[training_id]

    async def broadcast(self, training_id: str, data: dict):
        # 保存历史
        if training_id not in self.history_data:
            self.history_data[training_id] = deque(maxlen=10)
        self.history_data[training_id].append(data)
        if training_id in self.active_connections:
            for ws in self.active_connections[training_id]:
                await ws.send_json(data)

manager = ConnectionManager()

class ProgressReport(BaseModel):
    training_id: str = Field(..., description="训练任务唯一标识")
    epoch: int = Field(..., description="当前epoch")
    batch: Optional[int] = Field(None, description="当前batch")
    total_batches: Optional[int] = Field(None, description="总batch数")
    loss: float = Field(..., description="损失值")
    accuracy: Optional[float] = Field(None, description="准确率")
    learning_rate: Optional[float] = Field(None, description="学习率")
    timestamp: Optional[str] = Field(None, description="时间戳，ISO8601格式")
    custom_metrics: Optional[dict] = Field(None, description="自定义指标")

    @root_validator(pre=True)
    def set_timestamp(cls, values):
        if not values.get("timestamp"):
            values["timestamp"] = datetime.utcnow().isoformat() + "Z"
        return values

@app.post("/api/v1/report_progress")
async def report_progress(data: ProgressReport):
    # 数据校验和类型转换已由Pydantic完成
    d = data.dict()
    training_id = d["training_id"]
    manager.latest_data[training_id] = d
    await manager.broadcast(training_id, d)
    return {"status": "success", "message": "Progress reported"}

@app.get("/api/v1/trainings")
def list_trainings():
    """返回所有已上报过的training_id列表"""
    return {"trainings": list(manager.latest_data.keys())}

@app.websocket("/ws/{training_id}")
async def websocket_endpoint(websocket: WebSocket, training_id: str):
    await manager.connect(training_id, websocket)
    try:
        while True:
            try:
                # 等待心跳或ping，前端可定期发送任意消息保持连接
                await asyncio.wait_for(websocket.receive_text(), timeout=60)
            except asyncio.TimeoutError:
                # 超时未收到消息，发送ping
                await websocket.send_text("ping")
    except WebSocketDisconnect:
        manager.disconnect(training_id, websocket)
    except Exception:
        manager.disconnect(training_id, websocket)
