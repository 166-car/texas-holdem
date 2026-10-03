# 德州扑克 Texas Hold'em（单机版）

在浏览器里单机对战 3 个 AI 的德州扑克游戏。由 [Kimi Work](https://github.com/166-car) 构建。

## 玩法

- 每人初始 1000 筹码，盲注 10/20，庄家按钮每局轮转
- 与 3 个风格各异的 AI 对手（不同激进程度）对战
- 完整下注轮：翻牌前 / 翻牌 / 转牌 / 河牌，支持过牌、跟注、加注、全下
- 摊牌自动从 7 张牌中选出最优 5 张比大小，支持边池（side pot）结算
- 破产出局机制：把对手全部淘汰即获胜，自己筹码归零则失败

## 技术栈

React 19 + TypeScript + Vite + Tailwind CSS

- `src/poker/engine.ts` — 扑克引擎：牌组、7 选 5 牌型评估（同花顺～高牌 9 级）、AI 决策（手牌强度估算 + 底池赔率 + 少量诈唬）
- `src/poker/game.ts` — 对局状态机：下注轮推进、行动权轮转、边池计算与结算
- `src/App.tsx` — 牌桌界面与交互
- `src/components/CardView.tsx` — 扑克牌组件（纯 CSS 绘制）

## 运行

```bash
npm install
npm run dev      # 开发模式 http://localhost:3000
npm run build    # 生产构建到 dist/
```

## 测试

无头仿真测试：模拟 500 局完整对局（所有玩家由 AI 驱动），校验牌型评估正确性、每步筹码守恒、牌张唯一性、对局必然终结。

```bash
npm install
node sim-test.mjs
```

## 部署

`npm run build` 后 `dist/` 是纯静态站点，可直接托管到 GitHub Pages / Vercel / Netlify。注意 `vite.config.ts` 中 `base: './'` 已配置为相对路径，兼容 Pages 的子路径部署。
