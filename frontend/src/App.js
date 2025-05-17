import React, { useState, useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

// 可自定义y轴范围
const LOSS_MIN = 0;
const LOSS_MAX = 2; // 你可以根据实际情况调整
const ACC_MIN = 0;
const ACC_MAX = 1;

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

  // 阈值状态
  const [lossMin, setLossMin] = useState(0);
  const [lossMax, setLossMax] = useState(2);
  const [showThreshold, setShowThreshold] = useState(false);
  const [showMetrics, setShowMetrics] = useState(true);
  const [showChart, setShowChart] = useState(true);

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
      setHistory(h => [...h, data]); // 不再slice(-10)，保留全部
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
              yAxisID: 'y',
              pointRadius: 0, // 不显示点
              pointHoverRadius: 0, // 悬停也不显示点
              tension: 0.3 // 平滑曲线，可调
            },
          ],
        },
        options: {
          responsive: true,
          plugins: { legend: { display: true } },
          scales: {
            x: {
              type: 'category',
              title: { display: true, text: 'Time' },
            },
            y: {
              type: 'linear', position: 'left', title: { display: true, text: 'Loss' },
              min: lossMin, max: lossMax
            },
          },
        },
      });
    }
  }, []);

  // 动态更新y轴阈值
  useEffect(() => {
    if (!chartInstance.current) return;
    chartInstance.current.options.scales.y.min = lossMin;
    chartInstance.current.options.scales.y.max = lossMax;
    chartInstance.current.update();
  }, [lossMin, lossMax]);

  // 更新Chart数据（x轴为时间，y轴为loss）
  useEffect(() => {
    if (!chartInstance.current) return;
    const chart = chartInstance.current;
    chart.data.labels = history.map(d => {
      if (d.timestamp) {
        const t = new Date(d.timestamp);
        return t.toLocaleTimeString('en-US', { hour12: false });
      }
      return '';
    });
    chart.data.datasets[0].data = history.map(d => d.loss);
    chart.update();
  }, [history, lossMin, lossMax]);

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
        {/* 阈值设置区域（可折叠） */}
        <div style={{ marginBottom: 18 }}>
          <button onClick={() => setShowThreshold(v => !v)} style={{ background: '#2b4a6f', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 16px', cursor: 'pointer', fontWeight: 500, marginBottom: 8 }}>
            {showThreshold ? '收起阈值设置 ▲' : '展开阈值设置 ▼'}
          </button>
          {showThreshold && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap', background: '#f8f8f8', borderRadius: 8, padding: 12, marginTop: 8 }}>
              <span style={labelStyle}>Loss范围:</span>
              <input type="number" value={lossMin} onChange={e => setLossMin(Number(e.target.value))} style={{ width: 60, borderRadius: 4, border: '1px solid #bbb', padding: '2px 6px' }} />
              <span>~</span>
              <input type="number" value={lossMax} onChange={e => setLossMax(Number(e.target.value))} style={{ width: 60, borderRadius: 4, border: '1px solid #bbb', padding: '2px 6px' }} />
            </div>
          )}
        </div>
        {/* 最新指标区（可折叠） */}
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowMetrics(v => !v)} style={{ background: '#2b4a6f', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 16px', cursor: 'pointer', fontWeight: 500, marginBottom: 8 }}>
            {showMetrics ? '收起最新指标 ▲' : '展开最新指标 ▼'}
          </button>
          {showMetrics && (
            <div style={cardStyle}>
              <strong style={{ fontSize: 18, color: '#2b4a6f' }}>最新指标</strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, margin: '16px 0' }}>
                <div><span style={labelStyle}>Epoch:</span><span style={valueStyle}>{metrics.epoch}</span></div>
                <div><span style={labelStyle}>Batch:</span><span style={valueStyle}>{metrics.batch}</span></div>
                <div><span style={labelStyle}>Loss:</span><span style={valueStyle}>{metrics.loss}</span></div>
                <div><span style={labelStyle}>Learning Rate:</span><span style={valueStyle}>{metrics.learning_rate}</span></div>
              </div>
              {Object.keys(customMetrics).length > 0 && <div style={{ marginTop: 8 }}>自定义指标:
                <ul style={{ margin: 0, paddingLeft: 20 }}>
                  {Object.entries(customMetrics).map(([k, v]) => <li key={k}>{k}: {v}</li>)}
                </ul>
              </div>}
            </div>
          )}
        </div>
        {/* Loss图表区（可折叠） */}
        <div style={{ marginBottom: 8 }}>
          <button onClick={() => setShowChart(v => !v)} style={{ background: '#2b4a6f', color: '#fff', border: 'none', borderRadius: 6, padding: '4px 16px', cursor: 'pointer', fontWeight: 500, marginBottom: 8 }}>
            {showChart ? '收起Loss曲线 ▲' : '展开Loss曲线 ▼'}
          </button>
          {showChart && (
            <div style={cardStyle}>
              <strong style={{ fontSize: 18, color: '#2b4a6f' }}>Loss 曲线（所有历史数据）</strong>
              <canvas ref={chartRef} height={320}></canvas>
            </div>
          )}
        </div>
        <div style={{ marginTop: 16, color: '#888', fontSize: 13, textAlign: 'center' }}>
          {history.length === 0 ? '等待训练数据推送...' : `已接收 ${history.length} 条数据`}
        </div>
      </div>
    </div>
  );
}

export default App;
