import { useEffect, useState, useMemo } from 'react';
import './DashboardUI.css';

interface NodeInfo {
  id: string;
  type: 'agent' | 'plugin' | 'dashboard';
  location?: { lat: number; lng: number };
  status: 'idle' | 'busy' | 'offline';
  capabilities: string[];
  performanceScore: number;
  rewardPoints: number;
  trustScore: number;
}

interface TaskInfo {
  taskId: string;
  type: string;
  requesterId: string;
  workerId?: string;
  status: 'pending' | 'completed' | 'failed';
  timestamp: number;
}

function App() {
  const [nodes, setNodes] = useState<NodeInfo[]>([]);
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      setConnected(true);
      console.log('Connected to GigaCompute Network');
      ws.send(JSON.stringify({
        type: 'register',
        payload: {
          id: `dashboard-${Date.now()}`,
          type: 'dashboard',
          status: 'idle',
          capabilities: ['visualization']
        }
      }));
    };

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg.type === 'system_state') {
          setNodes(msg.payload.nodes);
        } else if (msg.type === 'task_request' || msg.type === 'task_response') {
          const payload = msg.payload;
          setTasks((prev) => {
            const exists = prev.find(t => t.taskId === payload.taskId);
            if (exists) {
              return prev.map(t => t.taskId === payload.taskId ? { ...t, ...payload, status: msg.type === 'task_response' ? 'completed' : 'pending' } : t);
            }
            return [{ ...payload, status: msg.type === 'task_response' ? 'completed' : 'pending', timestamp: Date.now() }, ...prev].slice(0, 50);
          });
        }
      } catch (e) {
        console.error('Network Error', e);
      }
    };

    ws.onclose = () => setConnected(false);
    return () => ws.close();
  }, []);

  const stats = useMemo(() => {
    const agents = nodes.filter(n => n.type === 'agent');
    return {
      totalNodes: nodes.length,
      activeAgents: agents.filter(a => a.status !== 'offline').length,
      busyAgents: agents.filter(a => a.status === 'busy').length,
      totalTasks: tasks.length
    };
  }, [nodes, tasks]);

  // Simplified Map Projection (Mercator-ish)
  const getCoordinates = (lat: number, lng: number) => {
    const x = (lng + 180) * (800 / 360);
    const y = (90 - lat) * (400 / 180);
    return { x, y };
  };

  return (
    <div className="dashboard-container">
      {/* Header */}
      <header className="header">
        <div className="logo-text">GIGA COMPUTE</div>
        <div className="system-status">
          <div className="stat-item">
            <span className="stat-label">Network Status</span>
            <span className="stat-value" style={{ color: connected ? 'var(--accent-cyan)' : 'var(--accent-pink)' }}>
              {connected ? 'STABLE' : 'OFFLINE'}
            </span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Active Nodes</span>
            <span className="stat-value">{stats.totalNodes}</span>
          </div>
          <div className="stat-item">
            <span className="stat-label">Compute Power</span>
            <span className="stat-value">{stats.activeAgents * 12.4} TFLOPS</span>
          </div>
        </div>
      </header>

      {/* Left Sidebar: Node Intelligence */}
      <aside className="sidebar glass-panel">
        <h2 className="sidebar-title">Node Registry</h2>
        <div className="nodes-list">
          {nodes.map(node => (
            <div key={node.id} className="node-card glass-panel">
              <div className="node-header">
                <span className="node-id">{node.id.slice(0, 8)}...</span>
                <span className={`node-status status-${node.status}`}></span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span className="node-type">{node.type}</span>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <span className="node-spec-badge" title="Performance">⚡ {node.performanceScore}</span>
                  <span className="node-reward-badge" title="Rewards">💎 {node.rewardPoints}</span>
                  <span className={`node-trust-badge ${node.trustScore <= 40 ? 'low-trust' : ''}`} title="Trust">
                    🛡️ {node.trustScore}
                    {node.trustScore <= 40 && ' (DANGER!)'}
                  </span>
                </div>
              </div>
              <div style={{ fontSize: '0.6rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                {node.location ? `${node.location.lat.toFixed(1)}, ${node.location.lng.toFixed(1)}` : 'UNKNOWN'}
              </div>
            </div>
          ))}
        </div>
      </aside>

      {/* Main Content: Tactical Map */}
      <main className="main-content">
        <div className="world-map">
          <svg viewBox="0 0 800 400" className="map-svg">
            {/* World Map Background (Simplified) */}
            <rect width="800" height="400" fill="transparent" />
            <path d="M150,100 L200,80 L250,90 L300,120 L350,110 L400,130 L450,120 L500,140 L550,130 L600,150 L650,140 L700,160 L750,150 L800,170 L800,400 L0,400 L0,150 Z" opacity="0.1" fill="var(--accent-purple)" />

            {/* Connection Lines (Glowing effect) */}
            {tasks.filter(t => t.status === 'pending').map(task => {
              const requester = nodes.find(n => n.id === task.requesterId);
              const worker = nodes.find(n => n.id === task.workerId);
              if (requester?.location && worker?.location) {
                const stop1 = getCoordinates(requester.location.lat, requester.location.lng);
                const stop2 = getCoordinates(worker.location.lat, worker.location.lng);
                return (
                  <line
                    key={task.taskId}
                    x1={stop1.x} y1={stop1.y}
                    x2={stop2.x} y2={stop2.y}
                    stroke="var(--accent-cyan)"
                    strokeWidth="1"
                    strokeDasharray="4 4"
                    opacity="0.5"
                  >
                    <animate attributeName="stroke-dashoffset" from="0" to="20" dur="1s" repeatCount="indefinite" />
                  </line>
                );
              }
              return null;
            })}

            {/* Nodes on Map */}
            {nodes.map(node => {
              if (!node.location) return null;
              const { x, y } = getCoordinates(node.location.lat, node.location.lng);
              return (
                <g key={node.id} className="map-node">
                  <circle cx={x} cy={y} r="3" className="node-dot" />
                  {node.status === 'busy' && (
                    <circle cx={x} cy={y} r="3" className="node-ripple" />
                  )}
                </g>
              );
            })}
          </svg>
        </div>
        <div style={{ position: 'absolute', bottom: '20px', left: '20px', color: 'var(--text-dim)', fontSize: '0.7rem' }}>
          LIVE TACTICAL OVERLAY [V.1.0.4]
        </div>
      </main>

      {/* Right Sidebar: Metrics (Placeholder) */}
      <aside className="sidebar glass-panel">
        <h2 className="sidebar-title">Global Load</h2>
        <div style={{ height: '120px', background: 'rgba(0,0,0,0.3)', position: 'relative', overflow: 'hidden' }}>
          {/* Mock Graph */}
          <svg viewBox="0 0 100 50" width="100%" height="100%" preserveAspectRatio="none">
            <polyline
              fill="none"
              stroke="var(--accent-purple)"
              strokeWidth="1"
              points="0,50 10,45 20,48 30,30 40,35 50,10 60,25 70,5 80,15 90,10 100,20"
            />
          </svg>
        </div>
        <h2 className="sidebar-title" style={{ marginTop: '1rem' }}>Security Protocol</h2>
        <div style={{ fontSize: '0.7rem', fontFamily: 'monospace', color: 'var(--accent-cyan)' }}>
          {`> ZERO-TRUST: ENABLED\n> ENCRYPTION: AES-256\n> TUNNEL: ESTABLISHED\n> ANOMALY: NONE`}
        </div>
      </aside>

      {/* Footer: Task Feed */}
      <footer className="task-feed glass-panel">
        {tasks.length === 0 ? (
          <div style={{ color: 'var(--text-dim)', fontStyle: 'italic' }}>Monitoring quantum channels...</div>
        ) : (
          tasks.map(task => (
            <div key={task.taskId} className="task-item glass-panel">
              <div className="task-icon">◈</div>
              <div className="task-info">
                <span className="task-type">{task.type}</span>
                <span className="task-user">
                  {task.requesterId.slice(0, 8)} → {task.status.toUpperCase()}
                </span>
              </div>
            </div>
          ))
        )}
      </footer>
    </div>
  );
}

export default App;
