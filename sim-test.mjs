// 德州扑克引擎无头仿真测试
import { execSync } from 'node:child_process';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(root, '.sim-dist');
mkdirSync(outDir, { recursive: true });
execSync(
  `"${path.join(root, 'node_modules/.bin/esbuild')}" src/poker/engine.ts --format=esm --outfile=${path.join(outDir, 'engine.mjs')}`,
  { cwd: root, stdio: 'inherit' }
);
execSync(
  `"${path.join(root, 'node_modules/.bin/esbuild')}" src/poker/game.ts --bundle --format=esm --outfile=${path.join(outDir, 'game.mjs')}`,
  { cwd: root, stdio: 'inherit' }
);

const engine = await import(pathToFileURL(path.join(outDir, 'engine.mjs')).href);
const game = await import(pathToFileURL(path.join(outDir, 'game.mjs')).href);

let failures = 0;
const check = (cond, msg) => {
  if (!cond) { failures++; console.error('❌', msg); }
};

// ---- 牌型评估单元测试 ----
const c = (rank, suit) => ({ rank, suit });
const score = (arr) => engine.evaluate5(arr.map(([r, s]) => c(r, s)));

// 同花顺 > 四条
check(engine.compareScores(score([[10,'s'],[11,'s'],[12,'s'],[13,'s'],[14,'s']]), score([[9,'h'],[9,'d'],[9,'c'],[9,'s'],[14,'d']])) > 0, '同花顺应大于四条');
// 轮子顺 A-2-3-4-5
const wheel = score([[14,'h'],[2,'d'],[3,'c'],[4,'s'],[5,'d']]);
check(wheel.cat === 4 && wheel.tie[0] === 5, 'A-2-3-4-5 应为 5 高顺子');
// 葫芦 vs 同花
check(engine.compareScores(score([[12,'h'],[12,'d'],[12,'c'],[5,'s'],[5,'d']]), score([[2,'h'],[5,'h'],[9,'h'],[12,'h'],[14,'h']])) > 0, '葫芦应大于同花');
// 两对比一对
check(engine.compareScores(score([[8,'h'],[8,'d'],[3,'c'],[3,'s'],[14,'d']]), score([[8,'c'],[8,'s'],[3,'h'],[4,'d'],[5,'c']])) > 0, '两对应大于一对');
// 7 选 5：四条带 A 踢脚应从 7 张中正确选出
const best = engine.evaluateBest([[9,'h'],[9,'d'],[9,'c'],[9,'s'],[14,'h'],[2,'d'],[7,'c']].map(([r,s]) => c(r,s)));
check(best.cat === 7 && best.tie[0] === 9 && best.tie[1] === 14, '7张牌评估应取四条9+A踢脚');
// 同花顺应从 7 张中识别（含干扰牌）
const sf = engine.evaluateBest([[10,'s'],[11,'s'],[12,'s'],[13,'s'],[14,'s'],[2,'d'],[7,'c']].map(([r,s]) => c(r,s)));
check(sf.cat === 8, '7张牌中应识别出皇家同花顺');

// ---- 完整对局仿真 ----
const TOTAL_CHIPS = 4000;
const HANDS = 500;
let handsPlayed = 0, show = 0, foldsWin = 0;

for (let h = 0; h < HANDS; h++) {
  game.freshDeck();
  let s = game.startNewHand(game.initialState());
  const seen = new Set();
  for (const p of s.players) for (const cd of p.hole) seen.add(cd.rank + cd.suit);
  check(seen.size === 8, '底牌应互不重复');

  let guard = 0;
  while (game.isBettingStage(s.stage) && guard++ < 500) {
    const p = s.players[s.actorIdx];
    const action = engine.decideAI({
      hole: p.hole, community: s.community,
      toCall: Math.max(0, s.currentBet - p.bet),
      pot: game.potOf(s), chips: p.chips, bet: p.bet,
      currentBet: s.currentBet, bigBlind: game.BIG_BLIND, aggr: p.aggr,
    });
    s = game.performAction(s, s.actorIdx, action);
    // 下注中：筹码 + 已下注 = 恒定；结束后：底池已转入筹码，筹码总和 = 恒定
    const conserved = game.isBettingStage(s.stage)
      ? s.players.reduce((a, p2) => a + p2.chips + p2.totalBet, 0)
      : s.players.reduce((a, p2) => a + p2.chips, 0);
    if (conserved !== TOTAL_CHIPS) check(false, `筹码不守恒: ${conserved}`);
    if (s.players.some((p2) => p2.chips < 0)) check(false, '筹码为负');
  }
  check(guard < 500, '对局应在有限步数内结束');
  if (s.stage === 'gameover') break;
  handsPlayed++;
  for (const cd of s.community) {
    const key = cd.rank + cd.suit;
    check(!seen.has(key), '公共牌与底牌重复!');
    seen.add(key);
  }
  check(seen.size === 8 + s.community.length, '所有牌应唯一');
  if (s.community.length === 5) show++;
  if (s.message.includes('对手弃牌')) foldsWin++;
  check(s.stage === 'handover', '结束后应进入 handover');
  const finalChips = s.players.reduce((a, p2) => a + p2.chips, 0);
  if (finalChips !== TOTAL_CHIPS) check(false, `结束后筹码不守恒: ${finalChips}`);
}

console.log(`\n仿真完成: ${handsPlayed} 局, 摊牌 ${show} 局, 弃牌获胜 ${foldsWin} 局`);
if (failures === 0) console.log('✅ 全部测试通过');
else { console.error(`❌ ${failures} 项失败`); process.exit(1); }
