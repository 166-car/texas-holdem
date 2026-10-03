// ============================================================
// 德州扑克对局状态机：玩家、下注轮、边池结算
// ============================================================

import {
  newDeck, evaluateBest, compareScores, handName,
} from './engine';
import type { Card, HandScore } from './engine';

export interface Player {
  id: number;
  name: string;
  isAI: boolean;
  aggr: number; // AI 激进程度
  chips: number;
  hole: Card[];
  folded: boolean;
  allIn: boolean;
  out: boolean; // 破产出局
  bet: number; // 本轮下注
  totalBet: number; // 整手牌累计下注
  acted: boolean;
  score?: HandScore;
  lastAction: string; // 展示用
}

export type Stage =
  | 'idle'
  | 'preflop'
  | 'flop'
  | 'turn'
  | 'river'
  | 'showdown'
  | 'handover'
  | 'gameover';

export interface GameState {
  players: Player[];
  community: Card[];
  currentBet: number;
  actorIdx: number;
  dealerIdx: number;
  stage: Stage;
  message: string;
  log: string[];
  handNumber: number;
  result: 'playing' | 'won' | 'lost';
}

export type UserAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number };

export const START_CHIPS = 1000;
export const SMALL_BLIND = 10;
export const BIG_BLIND = 20;

const AI_NAMES = ['阿尔法', '贝塔', '伽马'];

export function initialPlayers(): Player[] {
  return [
    {
      id: 0, name: '你', isAI: false, aggr: 0.5, chips: START_CHIPS,
      hole: [], folded: false, allIn: false, out: false, bet: 0, totalBet: 0, acted: false, lastAction: '',
    },
    ...AI_NAMES.map((name, i) => ({
      id: i + 1, name, isAI: true, aggr: 0.35 + i * 0.2, chips: START_CHIPS,
      hole: [] as Card[], folded: false, allIn: false, out: false, bet: 0, totalBet: 0, acted: false, lastAction: '',
    })),
  ];
}

export function initialState(): GameState {
  return {
    players: initialPlayers(),
    community: [],
    currentBet: 0,
    actorIdx: 0,
    dealerIdx: 0,
    stage: 'idle',
    message: '',
    log: [],
    handNumber: 0,
    result: 'playing',
  };
}

// ---------- 工具 ----------

export const potOf = (s: GameState) => s.players.reduce((acc, p) => acc + p.totalBet, 0);

export const isBettingStage = (st: Stage) =>
  st === 'preflop' || st === 'flop' || st === 'turn' || st === 'river';

const alive = (p: Player) => !p.out && !p.folded;
const canAct = (p: Player) => !p.out && !p.folded && !p.allIn && p.chips > 0;

function nextIdx(players: Player[], from: number, pred: (p: Player) => boolean): number {
  for (let k = 1; k <= players.length; k++) {
    const j = (from + k) % players.length;
    if (pred(players[j])) return j;
  }
  return -1;
}

const pushLog = (s: GameState, line: string): GameState => ({
  ...s, log: [...s.log.slice(-60), line],
});

// ---------- 牌组（模块级，整局共用） ----------

let deckStore: Card[] = [];

export function freshDeck(): Card[] {
  deckStore = newDeck();
  return deckStore;
}

function draw(n: number): Card[] {
  const out: Card[] = [];
  for (let i = 0; i < n; i++) out.push(deckStore.pop()!);
  return out;
}

// ---------- 新一局 ----------

export function startNewHand(prev: GameState): GameState {
  // 标记破产者出局
  const players: Player[] = prev.players.map((p) => ({
    ...p,
    out: p.chips <= 0,
    hole: [],
    folded: false,
    allIn: false,
    bet: 0,
    totalBet: 0,
    acted: false,
    score: undefined,
    lastAction: '',
  }));

  let s: GameState = {
    ...prev,
    players,
    community: [],
    currentBet: 0,
    stage: 'preflop',
    message: '',
    result: 'playing',
    handNumber: prev.handNumber + 1,
  };
  s = pushLog(s, `—— 第 ${s.handNumber} 局 ——`);

  // 庄家轮转
  const dealerIdx = nextIdx(players, prev.dealerIdx, (p) => !p.out);
  s = { ...s, dealerIdx };

  const sbIdx = nextIdx(players, dealerIdx, (p) => !p.out);
  const bbIdx = nextIdx(players, sbIdx, (p) => !p.out);

  const post = (idx: number, amount: number) => {
    const p = s.players[idx];
    const paid = Math.min(amount, p.chips);
    p.chips -= paid;
    p.bet += paid;
    p.totalBet += paid;
    if (p.chips === 0) p.allIn = true;
  };
  post(sbIdx, SMALL_BLIND);
  post(bbIdx, BIG_BLIND);
  s = pushLog(s, `${players[sbIdx].name} 下小盲 ${SMALL_BLIND}，${players[bbIdx].name} 下大盲 ${BIG_BLIND}`);

  // 发底牌
  for (let r = 0; r < 2; r++) {
    for (let k = 1; k <= players.length; k++) {
      const j = (dealerIdx + k) % players.length;
      if (!players[j].out) players[j].hole.push(draw(1)[0]);
    }
  }

  s = { ...s, currentBet: s.players[bbIdx].bet };
  const first = nextIdx(players, bbIdx, canAct);
  s = { ...s, actorIdx: first };
  return s;
}

// ---------- 动作 ----------

export function performAction(prev: GameState, idx: number, action: UserAction): GameState {
  let s: GameState = { ...prev, players: prev.players.map((p) => ({ ...p })) };
  const p = s.players[idx];
  const toCall = Math.max(0, s.currentBet - p.bet);

  switch (action.type) {
    case 'fold':
      p.folded = true;
      p.lastAction = '弃牌';
      s = pushLog(s, `${p.name} 弃牌`);
      break;
    case 'check':
      p.acted = true;
      p.lastAction = '过牌';
      s = pushLog(s, `${p.name} 过牌`);
      break;
    case 'call': {
      const paid = Math.min(toCall, p.chips);
      p.chips -= paid;
      p.bet += paid;
      p.totalBet += paid;
      if (p.chips === 0) p.allIn = true;
      p.acted = true;
      p.lastAction = paid === 0 ? '过牌' : `跟注 ${paid}`;
      s = pushLog(s, paid === 0 ? `${p.name} 过牌` : `${p.name} 跟注 ${paid}${p.allIn ? '（全下）' : ''}`);
      break;
    }
    case 'raise': {
      const target = Math.min(action.amount, p.bet + p.chips);
      const paid = target - p.bet;
      p.chips -= paid;
      p.bet = target;
      p.totalBet += paid;
      if (p.chips === 0) p.allIn = true;
      p.acted = true;
      p.lastAction = s.currentBet === 0 ? `下注 ${target}` : `加注到 ${target}`;
      s = pushLog(s, `${p.name} ${p.lastAction}${p.allIn ? '（全下）' : ''}`);
      s = { ...s, currentBet: Math.max(s.currentBet, target) };
      break;
    }
  }

  return advance(s, idx);
}

/** 推进行动权；若本轮结束则转入下一阶段 */
function advance(prev: GameState, fromIdx: number): GameState {
  let s: GameState = { ...prev, players: prev.players.map((p) => ({ ...p })) };
  const players = s.players;

  const remaining = players.filter(alive);
  if (remaining.length === 1) {
    // 其他人全弃牌，直接赢得底池
    const winner = remaining[0];
    const pot = potOf(s);
    winner.chips += pot;
    s = pushLog(s, `${winner.name} 赢得底池 ${pot}（对手弃牌）`);
    return endHand(s, `${winner.name} 赢得底池 ${pot}（对手弃牌）`);
  }

  const pending = players.filter(
    (p) => canAct(p) && (!p.acted || p.bet < s.currentBet),
  );
  if (pending.length > 0) {
    const next = nextIdx(players, fromIdx, (p) => canAct(p) && (!p.acted || p.bet < s.currentBet));
    return { ...s, actorIdx: next };
  }

  // 本轮下注结束
  const anyoneCanAct = players.some(canAct);
  if (!anyoneCanAct) {
    // 剩余玩家全部全下，直接发完公共牌比大小
    while (s.community.length < 5 && s.stage !== 'showdown') {
      const need = 5 - s.community.length;
      const dealNow = s.community.length === 0 ? 3 : Math.min(1, need);
      s = { ...s, community: [...s.community, ...draw(dealNow)] };
    }
    return showdown({ ...s, stage: 'showdown' });
  }

  const streetNext: Record<string, Stage> = { preflop: 'flop', flop: 'turn', turn: 'river', river: 'showdown' };
  const nextStage = streetNext[s.stage];
  if (nextStage === 'showdown') return showdown({ ...s, stage: 'showdown' });

  // 重置本轮下注，发下一张公共牌
  for (const p of players) {
    p.bet = 0;
    p.acted = false;
  }
  const dealCount = nextStage === 'flop' ? 3 : 1;
  s = { ...s, community: [...s.community, ...draw(dealCount)], currentBet: 0, stage: nextStage as Stage };
  const first = nextIdx(players, s.dealerIdx, canAct);
  return { ...s, actorIdx: first };
}

// ---------- 摊牌与结算 ----------

interface Pot {
  amount: number;
  eligible: Player[];
}

function computePots(players: Player[]): Pot[] {
  const contenders = players.filter(alive);
  // 层级必须包含所有投过筹码的玩家（含已弃牌者），否则弃牌玩家的下注会凭空消失
  const levels = [...new Set(players.filter((p) => p.totalBet > 0).map((p) => p.totalBet))].sort((a, b) => a - b);
  const pots: Pot[] = [];
  let prev = 0;
  for (const lv of levels) {
    if (lv <= 0) continue;
    const contributors = players.filter((p) => p.totalBet >= lv);
    const amount = (lv - prev) * contributors.length;
    pots.push({ amount, eligible: contenders.filter((p) => p.totalBet >= lv) });
    prev = lv;
  }
  return pots;
}

function showdown(prev: GameState): GameState {
  let s: GameState = { ...prev, players: prev.players.map((p) => ({ ...p })) };
  const contenders = s.players.filter(alive);
  for (const p of contenders) {
    p.score = evaluateBest([...p.hole, ...s.community]);
  }

  const pots = computePots(s.players);
  const winLines: string[] = [];
  for (const pot of pots) {
    let best: (typeof pot.eligible)[0] | null = null;
    let winners: typeof pot.eligible = [];
    for (const p of pot.eligible) {
      if (!best || compareScores(p.score!, best.score!) > 0) {
        best = p;
        winners = [p];
      } else if (compareScores(p.score!, best.score!) === 0) {
        winners = [...winners, p];
      }
    }
    const share = Math.floor(pot.amount / winners.length);
    let remainder = pot.amount - share * winners.length;
    for (const w of winners) {
      const extra = remainder > 0 ? 1 : 0;
      remainder -= extra;
      w.chips += share + extra;
    }
    winLines.push(
      `${winners.map((w) => w.name).join('、')} 以 ${handName(winners[0].score!)} 赢得 ${pot.amount}`,
    );
  }

  for (const line of winLines) s = pushLog(s, line);
  s = { ...s, stage: 'handover' };
  const summary = winLines.join('；');
  return endHand(s, summary);
}

function endHand(prev: GameState, summary: string): GameState {
  let s = { ...prev, message: summary, stage: 'handover' as Stage };
  // 破产判定
  const user = s.players[0];
  const aiAlive = s.players.filter((p) => p.isAI && p.chips > 0);
  if (user.chips <= 0) {
    s = pushLog(s, '你的筹码用完了……');
    return { ...s, stage: 'gameover', result: 'lost', message: '你破产了！' };
  }
  if (aiAlive.length === 0) {
    s = pushLog(s, '所有 AI 对手都被你淘汰！');
    return { ...s, stage: 'gameover', result: 'won', message: '🏆 你赢光了所有对手！' };
  }
  return s;
}

export { newDeck };
