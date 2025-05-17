import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

function App() {
  const [trainingId, setTrainingId] = useState('');
  const [allTrainings, setAllTrainings] = useState([]);
  const [metrics, setMetrics] = useState({});
  const [history, setHistory] = useState([]); // 存储历史点
  const [status, setStatus] = useState('connecting'); // connecting/ok/error
  const [errorMsg, setErrorMsg] = useState('');
  const chartRef = useRef(null);
  const chartInstance = useRef(null);
  const wsRef = useRef(null);

  // 获取所有训练ID（仅首次加载时获取）
  useEffect(() => {
    fetch('/api/v1/trainings')
      .then(res => res.json())
      .then(data => {
        setAllTrainings(data.trainings || []);
        if (!trainingId && data.trainings && data.trainings.length > 0) {
          setTrainingId(data.trainings[data.trainings.length - 1]); // 默认选最新
        }
      });
  }, []); // 只在首次加载时获取

  // 初始化和重连WebSocket
  useEffect(() => {
    if (!trainingId) return;
    let ws;
    let reconnectTimer;
    setStatus('connecting');
    setErrorMsg('');
    // 自动适配 ws/wss 及 host
    const wsProtocol = window.location.protocol === 'https:' ? 'wss://' : 'ws://';
    const wsUrl = wsProtocol + window.location.host + `/ws/${trainingId}`;
    ws = new window.WebSocket(wsUrl);
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
      setHistory(h => {
        // 只保留最近10条
        const newHist = [...h, data].slice(-10);
        return newHist;
      });
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

  // 美化样式
  const cardStyle = {
    background: '#fff',
    boxShadow: '0 2px 8px #eee',
    borderRadius: 10,
    padding: 24,
    margin: '24px 0',
    maxWidth: 700
  };
  const labelStyle = { color: '#888', fontWeight: 500, marginRight: 8 };
  const valueStyle = { color: '#222', fontWeight: 600 };

  return (
    <div style={{ minHeight: '100vh', width: '100vw', background: '#f4f6fa', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start' }}>
      <div style={{ width: '100%', maxWidth: 800, margin: '0 auto', flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'flex-start' }}>
        <h2 style={{ textAlign: 'center', margin: '32px 0 16px 0', color: '#2b4a6f' }}>AI训练实时监控</h2>
        <div style={{ marginBottom: 18, display: 'flex', alignItems: 'center', gap: 12 }}>
          <label style={labelStyle}>Training ID:</label>
          <select value={trainingId} onChange={e => setTrainingId(e.target.value)} style={{ width: 260, height: 32, borderRadius: 6, border: '1px solid #bbb', padding: '0 8px' }}>
            <option value="" disabled>请选择训练任务</option>
            {allTrainings.map(tid => <option key={tid} value={tid}>{tid}</option>)}
          </select>
          <span style={{ marginLeft: 16, color: status==='ok'?'#52c41a':status==='connecting'?'#faad14':'#f5222d', fontWeight: 700 }}>{status==='ok'?'● 已连接': status==='connecting'?'● 连接中':'● 断开'}</span>
        </div>
        {errorMsg && <div style={{ color: '#f5222d', marginBottom: 10 }}>{errorMsg}</div>}
        <div style={cardStyle}>
          <strong style={{ fontSize: 18, color: '#2b4a6f' }}>最新指标</strong>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '16px 0' }}>
            <div><span style={labelStyle}>Epoch:</span><span style={valueStyle}>{metrics.epoch}</span></div>
            <div><span style={labelStyle}>Batch:</span><span style={valueStyle}>{metrics.batch}</span></div>
            <div><span style={labelStyle}>Loss:</span><span style={valueStyle}>{metrics.loss}</span></div>
            <div><span style={labelStyle}>Accuracy:</span><span style={valueStyle}>{metrics.accuracy}</span></div>
            <div><span style={labelStyle}>Learning Rate:</span><span style={valueStyle}>{metrics.learning_rate}</span></div>
          </div>
          {Object.keys(customMetrics).length > 0 && <div style={{ marginTop: 8 }}>自定义指标:
            <ul style={{ margin: 0, paddingLeft: 20 }}>
              {Object.entries(customMetrics).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
            </ul>
          </div>}
        </div>
        <div style={cardStyle}>
          <strong style={{ fontSize: 18, color: '#2b4a6f' }}>Loss/Accuracy 曲线（最近10条）</strong>
          <canvas ref={chartRef} height={320}></canvas>
        </div>
        <div style={{ marginTop: 16, color: '#888', fontSize: 13, textAlign: 'center' }}>
          {history.length === 0 ? '等待训练数据推送...' : `已接收 ${history.length} 条数据`}
        </div>
      </div>
    </div>
  );
}

export default App;
