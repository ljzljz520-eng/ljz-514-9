# 🎪 星野音乐节 · 动线助手（Festival Route Planner）

观众选择 **舞台 / 餐饮摊 / 洗手间 / 出口**，系统综合
**步行距离、实时人流拥挤、封控路段** 三个因素实时推荐路线；
运营在后台更新 **节点开放状态 / 路段封控 / 人流等级** 后，
前端通过 SSE 即时收到变更并 **自动重新计算路线**。

## ✨ 功能

### 观众端 🧭
- 地图点选或列表选择起点 / 终点（舞台、餐饮、洗手间、出口）
- 加权 Dijkstra 一次给出多套方案：
  - **综合推荐**：`距离 × (1 + 0.35 × 人流)`，均衡省时
  - **舒适少挤**：`距离 × (1 + 0.85 × 人流)`，优先绕行拥挤路段
  - **距离最短**：纯距离最短路（可能较挤）
  - 路径相同的方案自动去重，逐段展示人流色点与途经节点
- 路线卡片：预计分钟数、总距离、最高人流、拥挤路段长度
- 简化场地图 SVG：分区底纹、按人流着色的路段、红色虚线封控段、
  起终点脉冲标记、推荐路线渐变流光动画，图例一键可读
- 起点/终点关闭、无可达路径时有明确中文提示

### 运营后台 🛠
- 点击地图节点：开放 / 关闭（关闭节点不可选、不可借道）
- 点击地图路段：封控 / 解封、设置 0–4 级实时人流
- 左侧分组列表批量查看全部设施状态
- 一键「恢复初始」运营状态
- 所有改动：① 落盘持久化（`server/data/state.json`）
  ② 通过 SSE 广播，观众端无需刷新即重算路线并重绘

## 🏗 技术栈

| 层 | 技术 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite，纯手写 SVG 地图与 CSS（无 UI 库） |
| 后端 | Node.js + Express，CommonJS |
| 算法 | 加权 Dijkstra（多权重策略），图模型：23 节点 / 32 条无向路段 |
| 实时 | Server-Sent Events (`/api/events`) |
| 持久 | JSON 文件落盘，服务重启保留，自动与底图合并 |

## 📁 目录

```
.
├── package.json            # 根脚本：一键安装 / dev / build / start
├── server/
│   └── src/
│       ├── graph.js        # 场地底图：节点、路段、初始人流/封控种子
│       ├── state.js        # 运营状态读写 + 持久化
│       ├── routing.js      # Dijkstra 引擎（三种权重 + 分段汇总）
│       └── index.js        # Express API + SSE + 生产静态托管
└── client/
    └── src/
        ├── App.tsx         # 观众 / 后台 双 Tab
        ├── useGraph.ts     # 拉取快照 + 订阅 SSE
        ├── api.ts / types.ts / constants.ts
        └── components/
            ├── MapView.tsx     # 简化场地图（SVG）
            ├── AudienceView.tsx
            ├── RouteCard.tsx
            └── AdminView.tsx
```

## 🚀 运行

```bash
# 1. 安装全部依赖（根 + server + client）
npm run install:all

# 2a. 开发模式（同时启动 :4001 API 与 :5173 前端，已配 /api 代理）
npm run dev
#    观众/后台：http://localhost:5173

# 2b. 生产模式（先构建前端，再由 Express 托管 dist）
npm run build
npm start
#    统一入口：http://localhost:4001
```

环境变量：`PORT`（后端端口，默认 4001）。

## 🔌 API 速览

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| GET | `/api/health` | 健康检查 |
| GET | `/api/graph` | 底图 + 实时状态合并快照 |
| POST | `/api/routes` | body `{ "start": "ST1", "goal": "F2" }`，返回 1–3 套方案 |
| PATCH | `/api/admin/nodes/:id` | body `{ "open": false }` |
| PATCH | `/api/admin/edges/:key` | body `{ "blocked": true, "crowd": 3 }`；key 支持 `A|B` / `A-B`，顺序无关 |
| POST | `/api/admin/reset` | 恢复初始运营状态 |
| GET | `/api/events` | SSE，事件 `state-change` |

人流等级：`0 畅通 / 1 顺畅 / 2 适中 / 3 拥挤 / 4 非常拥挤`，
对应通行速度 82 / 70 / 54 / 38 / 26 米/分钟。

## 🔁 路线如何响应管控

1. 后台 PATCH 写入状态 → 落盘 → SSE 广播 `state-change`
2. 前端 `useGraph` 收到事件 → 重新拉取 `/api/graph` → `version +1`
3. 观众视图监听 `version` → 以当前起终点重调 `/api/routes`
4. 封控边从邻接表剔除、关闭节点禁止借道，Dijkstra 自然绕行；
   若全部路径被切断，接口返回 422，前端展示不可达提示

初始演示数据：**中央环岛 ↔ 东侧路口** 处于封控状态，
从「主舞台」到「餐饮市集 B 区」可看到自动绕行北侧的效果。
