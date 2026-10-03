# 德州扑克 Texas Hold'em

浏览器里的德州扑克，支持**单机对战 AI** 和**多人在线联机**（2~6 名真人玩家）。由 Kimi Work 构建。

## 玩法

- 每人初始 1000 筹码，盲注 10/20，庄家按钮每局轮转
- 完整下注轮：翻牌前 / 翻牌 / 转牌 / 河牌，支持过牌、跟注、加注、全下
- 摊牌自动从 7 张牌中选出最优 5 张比大小，支持边池（side pot）结算与平分
- 破产出局机制：赢光所有对手获胜，自己筹码归零失败
- 单机模式：与 3 个风格各异的 AI 对手对战（不同激进程度，会偶尔诈唬）
- 联机模式：房间制，创建房间后把 4 位房间号告诉好友即可加入

## 运行

```bash
npm install

# 单机：只开前端
npm run dev          # http://localhost:3000

# 联机：先启动游戏服务器（默认端口 3001，可用 PORT 环境变量修改）
npm run server
# 然后每个玩家都用浏览器访问前端页面，选择「联机模式」
# 房主创建房间 → 好友输入房间号加入 → 房主点开始
```

局域网内：其他玩家访问 `http://<房主电脑的IP>:3000` 即可（服务器地址自动取当前主机名，同网段直连）。

## 测试

```bash
node sim-test.mjs    # 单机仿真：500 局完整对局，校验牌型评估、筹码守恒、牌张唯一
node mp-test.mjs     # 联机集成：真实服务器 + 2 个模拟客户端打完一整局
```

## 架构

React 19 + TypeScript + Vite + Tailwind CSS，联机服务器为 Node.js + ws。

| 文件 | 说明 |
|-|-|
| `src/poker/engine.ts` | 扑克引擎：牌组、7 选 5 牌型评估（同花顺～高牌 9 级）、AI 决策 |
| `src/poker/game.ts` | 对局状态机：下注轮推进、行动权轮转、边池结算；牌组在状态内，天然支持服务器多房间并发 |
| `server/index.ts` | WebSocket 房间服务器：建房/加入/开局/行动转发/断线自动弃牌 |
| `src/App.tsx` | 主菜单、单机模式、联机模式（大厅 + 连接管理） |
| `src/components/TableView.tsx` | 牌桌渲染（单机/联机共用） |
| `src/components/CardView.tsx` | 扑克牌组件（纯 CSS 绘制） |

### 联机协议（JSON 文本帧）

客户端 → 服务器：`create` / `join` / `start`（房主）/ `action`（仅当前行动座位）/ `nextHand`
服务器 → 客户端：`lobby`（房间与座位信息）/ `state`（牌局状态广播）/ `error`

## 部署

`npm run build` 后 `dist/` 是纯静态站点；联机服务器可用 `npm run server` 部署到任意 Node.js 环境（VPS / 云函数），公网部署时前端通过 `wss://` 连接。
