import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

function App() {
  const [trainingId, setTrainingId] = useState('demo-training');
  const [metrics, setMetrics] = useState({});
  const [history, setHistory] = useState([]); // 存储历史点
  const [status, setStatus] = useState('connecting'); // connecting/ok/error
  const [errorMsg, setErrorMsg] = useState('');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const wsRef = useRef(null);

  // 初始化和重连WebSocket
  useEffect(() => {
    if (!trainingId) return;
    let ws;
    let reconnectTimer;
    setStatus('connecting');
    setErrorMsg('');
    ws = new window.WebSocket(`ws://localhost:8000/ws/${trainingId}`);
    wsRef.current = ws;
    ws.onopen = () => setStatus('ok');
    ws.onerror = (e) => {
      setStatus('error');
      setErrorMsg('WebSocket连接失败');
    };
    ws.onclose = () => {
      setStatus('error');
      setErrorMsg('WebSocket已断开，正在重连...');
      reconnectTimer = setTimeout(() => setTrainingId(tid => tid), 2000); // 触发重连
    };
    ws.onmessage = (event) => {
      if (event.data === 'ping') return;
      const data = JSON.parse(event.data);
      setMetrics(data);
      setHistory(h => [...h, data]);
    };
    return () => {
      ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
      setHistory([]);
    };
  }, [trainingId]);

  // 初始化和更新Chart
  useEffect(() => {
    if (chartRef.current && !chartInstance.current) {
      chartInstance.current = new Chart(chartRef.current, {
        type: 'line',
        data: {
          labels: [],
          datasets: [
            {
              label: 'Loss',
              data: [],
              borderColor: 'red',
              fill: false,
            },
            {
              label: 'Accuracy',
              data: [],
              borderColor: 'blue',
              fill: false,
              yAxisID: 'y2',
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            y: { type: 'linear', position: 'left', title: { display: true, text: 'Loss' } },
            y2: { type: 'linear', position: 'right', title: { display: true, text: 'Accuracy' }, grid: { drawOnChartArea: false } },
          },
        },
      });
    }
  }, []);

  // 更新Chart数据
  useEffect(() => {
    if (!chartInstance.current) return;
    const chart = chartInstance.current;
    chart.data.labels = history.map(d => d.epoch || d.batch || history.indexOf(d)+1);
    chart.data.datasets[0].data = history.map(d => d.loss);
    chart.data.datasets[1].data = history.map(d => d.accuracy);
    chart.update();
  }, [history]);

  // 展示自定义指标
  const customMetrics = metrics.custom_metrics || {};

  return (
    <div style={{ maxWidth: 700, margin: 'auto', padding: 20 }}>
      <h2>AI训练实时监控</h2>
      <div style={{ marginBottom: 10 }}>
        <label>Training ID: </label>
        <input value={trainingId} onChange={e => setTrainingId(e.target.value)} style={{ width: 220 }} />
        <span style={{ marginLeft: 16, color: status==='ok'?'green':'orange' }}>{status==='ok'?'● 已连接': status==='connecting'?'● 连接中':'● 断开'}</span>
      </div>
      {errorMsg && <div style={{ color: 'red', marginBottom: 10 }}>{errorMsg}</div>}
      <div style={{ margin: '20px 0', background: '#f8f8f8', padding: 12, borderRadius: 6 }}>
        <strong>最新指标：</strong>
        <div>Epoch: {metrics.epoch}</div>
        <div>Batch: {metrics.batch}</div>
        <div>Loss: {metrics.loss}</div>
        <div>Accuracy: {metrics.accuracy}</div>
        <div>Learning Rate: {metrics.learning_rate}</div>
        {Object.keys(customMetrics).length > 0 && <div>自定义指标:
          <ul style={{ margin: 0, paddingLeft: 20 }}>
            {Object.entries(customMetrics).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
          </ul>
        </div>}
      </div>
      <canvas ref={chartRef} height={320}></canvas>
      <div style={{ marginTop: 16, color: '#888', fontSize: 13 }}>
        {history.length === 0 ? '等待训练数据推送...' : `已接收 ${history.length} 条数据`}
      </div>
    </div>
  );
}

export default App;
