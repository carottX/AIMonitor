"""
AI训练进度上报示例代码
将此代码片段集成到你的训练脚本中，在每个epoch或batch结束时调用report_progress_to_server函数。
"""
import requests
import time
import uuid
import json
import os

# 后端API地址
API_ENDPOINT = os.getenv("MONITORING_API_ENDPOINT", "http://localhost:8000/api/v1/report_progress")
# 本次训练的唯一ID（建议每次训练唯一）
TRAINING_ID = os.getenv("TRAINING_ID", str(uuid.uuid4()))

def report_progress_to_server(epoch, loss, accuracy=None, batch=None, total_batches=None, lr=None, custom_metrics=None):
    """向监控服务器上报训练进度"""
    payload = {
        "training_id": TRAINING_ID,
        "epoch": int(epoch),
        "loss": float(loss),
        "timestamp": time.strftime('%Y-%m-%dT%H:%M:%SZ', time.gmtime()),
    }
    if batch is not None:
        payload["batch"] = int(batch)
    if total_batches is not None:
        payload["total_batches"] = int(total_batches)
    if accuracy is not None:
        payload["accuracy"] = float(accuracy)
    if lr is not None:
        payload["learning_rate"] = float(lr)
    if custom_metrics:
        payload["custom_metrics"] = custom_metrics

    try:
        headers = {'Content-Type': 'application/json'}
        response = requests.post(API_ENDPOINT, data=json.dumps(payload), headers=headers, timeout=5)
        response.raise_for_status()
        print(f"[上报成功] epoch={epoch}, batch={batch if batch else '-'} status={response.status_code}")
    except requests.exceptions.RequestException as e:
        print(f"[上报失败] {e}")

# --- 示例用法 ---
if __name__ == "__main__":
    # 假设有100个epoch，每10个batch上报一次
    num_epochs = 3
    batches_per_epoch = 100000
    for epoch in range(1, num_epochs+1):
        for batch in range(1, batches_per_epoch+1):
            # 这里用随机数模拟loss/accuracy
            loss = 1.0 / (epoch * batch)
            accuracy = 0.5 + 0.5 * epoch / num_epochs
            lr = 0.01
            report_progress_to_server(
                epoch=epoch,
                loss=loss,
                accuracy=accuracy,
                batch=batch,
                total_batches=batches_per_epoch,
                lr=lr,
                custom_metrics={"gpu_mem": f"{batch*100}MB"}
            )
        # 每个epoch结束也可上报一次
        report_progress_to_server(
            epoch=epoch,
            loss=loss,
            accuracy=accuracy,
            total_batches=batches_per_epoch,
            lr=lr
        )
    print(f"训练结束，Training ID: {TRAINING_ID}")
