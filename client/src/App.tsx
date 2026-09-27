import { useState } from 'react';
import { useGraph } from './useGraph';
import AudienceView from './components/AudienceView';
import AdminView from './components/AdminView';

type Tab = 'audience' | 'admin';

export default function App() {
  const { graph, loading, error, version, reload } = useGraph();
  const [tab, setTab] = useState<Tab>('audience');

  return (
    <div className="app">
      <header className="app-header">
        <div className="brand">
          <span className="brand__logo">🎪</span>
          <div>
            <h1>星野音乐节 · 动线助手</h1>
            <p>舞台 / 餐饮 / 洗手间 / 出口 · 综合距离、人流与封控路段实时推荐</p>
          </div>
        </div>
        <nav className="tabs">
          <button
            type="button"
            className={`tab${tab === 'audience' ? ' tab--active' : ''}`}
            onClick={() => setTab('audience')}
          >
            🧭 观众动线
          </button>
          <button
            type="button"
            className={`tab tab--admin${tab === 'admin' ? ' tab--active' : ''}`}
            onClick={() => setTab('admin')}
          >
            🛠 运营后台
          </button>
        </nav>
      </header>

      {loading && <div className="status-screen">正在载入场地数据…</div>}
      {error && !loading && (
        <div className="status-screen status-screen--error">
          <p>⚠️ 无法连接动线服务：{error}</p>
          <button type="button" className="recommend-btn" onClick={() => void reload()}>重试</button>
        </div>
      )}
      {graph && !loading && !error && (
        tab === 'audience' ? (
          <AudienceView graph={graph} version={version} />
        ) : (
          <AdminView graph={graph} updatedAt={graph.updatedAt} reload={reload} />
        )
      )}

      <footer className="app-footer">
        路线基于加权 Dijkstra：权重 = 距离 ×（1 + 人流系数），封控路段不可通行 · 后台改动通过 SSE 实时推送重算
      </footer>
    </div>
  );
}
