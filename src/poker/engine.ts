// ============================================================
// 德州扑克核心引擎：牌、牌组、牌型评估、AI 决策
// ============================================================

export type Suit = '♠' | '♥' | '♦' | '♣';

export interface Card {
  rank: number; // 2-14，11=J 12=Q 13=K 14=A
  suit: Suit;
}

export const SUITS: Suit[] = ['♠', '♥', '♦', '♣'];

export function rankLabel(r: number): string {
  if (r === 14) return 'A';
  if (r === 13) return 'K';
  if (r === 12) return 'Q';
  if (r === 11) return 'J';
  return String(r);
}

export const isRedSuit = (s: Suit) => s === '♥' || s === '♦';

export function newDeck(): Card[] {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (let rank = 2; rank <= 14; rank++) {
      deck.push({ rank, suit });
    }
  }
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

// ------------------------------------------------------------
// 牌型评估
// ------------------------------------------------------------

export type HandCategory = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface HandScore {
  cat: HandCategory;
  tie: number[]; // 从大到小排列的决胜值
}

export const CATEGORY_NAMES = [
  '高牌', '一对', '两对', '三条', '顺子', '同花', '葫芦', '四条', '同花顺',
];

export function compareScores(a: HandScore, b: HandScore): number {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const len = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < len; i++) {
    const x = a.tie[i] ?? 0;
    const y = b.tie[i] ?? 0;
    if (x !== y) return x - y;
  }
  return 0;
}

/** 评估 5 张牌 */
export function evaluate5(cards: Card[]): HandScore {
  const ranks = cards.map((c) => c.rank).sort((a, b) => b - a);
  const suits = cards.map((c) => c.suit);
  const flush = suits.every((s) => s === suits[0]);

  const uniq = [...new Set(ranks)].sort((a, b) => b - a);
  let straightHigh = 0;
  if (uniq.length === 5) {
    if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
    else if (uniq[0] === 14 && uniq[1] === 5 && uniq[2] === 4 && uniq[3] === 3 && uniq[4] === 2)
      straightHigh = 5; // A-2-3-4-5 轮子顺
  }

  const count = new Map<number, number>();
  for (const r of ranks) count.set(r, (count.get(r) ?? 0) + 1);
  const groups = [...count.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);

  if (flush && straightHigh) return { cat: 8, tie: [straightHigh] };
  if (groups[0][1] === 4) return { cat: 7, tie: [groups[0][0], groups[1][0]] };
  if (groups[0][1] === 3 && groups[1][1] === 2)
    return { cat: 6, tie: [groups[0][0], groups[1][0]] };
  if (flush) return { cat: 5, tie: ranks };
  if (straightHigh) return { cat: 4, tie: [straightHigh] };
  if (groups[0][1] === 3) {
    const kickers = groups.slice(1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: 3, tie: [groups[0][0], ...kickers] };
  }
  if (groups[0][1] === 2 && groups[1][1] === 2) {
    const pairs = groups.filter((g) => g[1] === 2).map((g) => g[0]).sort((a, b) => b - a);
    const kicker = groups.find((g) => g[1] === 1)![0];
    return { cat: 2, tie: [...pairs, kicker] };
  }
  if (groups[0][1] === 2) {
    const kickers = groups.filter((g) => g[1] === 1).map((g) => g[0]).sort((a, b) => b - a);
    return { cat: 1, tie: [groups[0][0], ...kickers] };
  }
  return { cat: 0, tie: ranks };
}

/** 从任意张牌（2~7 张）中选出最优 5 张 */
export function evaluateBest(cards: Card[]): HandScore {
  let best: HandScore | null = null;
  const n = cards.length;
  if (n <= 5) return evaluate5(cards);
  for (let a = 0; a < n - 4; a++)
    for (let b = a + 1; b < n - 1; b++)
      for (let c = b + 1; c < n - 2; c++)
        for (let d = c + 1; d < n - 1; d++)
          for (let e = d + 1; e < n; e++) {
            const s = evaluate5([cards[a], cards[b], cards[c], cards[d], cards[e]]);
            if (!best || compareScores(s, best) > 0) best = s;
          }
  return best!;
}

/** 人类可读的牌型名称 */
export function handName(s: HandScore): string {
  const L = rankLabel;
  switch (s.cat) {
    case 8: return `同花顺 ${L(s.tie[0])}高`;
    case 7: return `四条 ${L(s.tie[0])}`;
    case 6: return `葫芦 ${L(s.tie[0])}带${L(s.tie[1])}`;
    case 5: return `同花 ${L(s.tie[0])}高`;
    case 4: return `顺子 ${L(s.tie[0])}高`;
    case 3: return `三条 ${L(s.tie[0])}`;
    case 2: return `两对 ${L(s.tie[0])}和${L(s.tie[1])}`;
    case 1: return `一对 ${L(s.tie[0])}`;
    default: return `高牌 ${L(s.tie[0])}`;
  }
}

// ------------------------------------------------------------
// AI 决策
// ------------------------------------------------------------

/** 估算手牌强度 0~1 */
export function estimateStrength(hole: Card[], community: Card[]): number {
  if (community.length === 0) {
    const [a, b] = [...hole].sort((x, y) => y.rank - x.rank);
    let s = (a.rank + b.rank) / 30;
    if (a.rank === b.rank) s += 0.35 + a.rank / 60;
    if (a.suit === b.suit) s += 0.06;
    if (Math.abs(a.rank - b.rank) === 1) s += 0.05;
    if (a.rank >= 13 && b.rank >= 10) s += 0.08;
    if (a.rank <= 8 && b.rank <= 8 && a.rank !== b.rank) s -= 0.15;
    return Math.min(1, Math.max(0.02, s));
  }
  const score = evaluateBest([...hole, ...community]);
  const base = score.cat / 8;
  const kicker = score.tie[0] / 14;
  return Math.min(1, base * 0.85 + kicker * 0.15);
}

export type AIAction =
  | { type: 'fold' }
  | { type: 'check' }
  | { type: 'call' }
  | { type: 'raise'; amount: number }; // amount = 目标总下注额

export interface AIDecisionContext {
  hole: Card[];
  community: Card[];
  toCall: number;
  pot: number;
  chips: number;
  bet: number; // 本轮已下注
  currentBet: number;
  bigBlind: number;
  aggr: number; // 0~1 激进程度
}

export function decideAI(ctx: AIDecisionContext): AIAction {
  const strength = estimateStrength(ctx.hole, ctx.community);
  const noise = (Math.random() - 0.5) * 0.18;
  const r = Math.min(1, Math.max(0, strength + noise + (ctx.aggr - 0.5) * 0.15));

  if (ctx.toCall === 0) {
    if (r > 0.6 || Math.random() < ctx.aggr * 0.12) {
      const raise = ctx.bigBlind * (1 + Math.floor(Math.random() * 3));
      return { type: 'raise', amount: Math.min(ctx.bet + raise, ctx.bet + ctx.chips) };
    }
    return { type: 'check' };
  }

  const potOdds = ctx.toCall / (ctx.pot + ctx.toCall);
  const minRaiseTo = ctx.currentBet + ctx.bigBlind;
  const maxTo = ctx.bet + ctx.chips;

  if (r > 0.78 && Math.random() < ctx.aggr && maxTo > minRaiseTo) {
    const extra = ctx.bigBlind * (1 + Math.floor(Math.random() * 3));
    return { type: 'raise', amount: Math.min(minRaiseTo + extra, maxTo) };
  }
  // 偶尔诈唬
  if (Math.random() < 0.04 && maxTo > minRaiseTo && ctx.toCall < ctx.pot * 0.4) {
    return { type: 'raise', amount: Math.min(minRaiseTo, maxTo) };
  }
  if (r > potOdds + 0.06 || ctx.toCall <= ctx.bigBlind) return { type: 'call' };
  return { type: 'fold' };
}
