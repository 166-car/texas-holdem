import { useEffect, useRef, useState } from 'react';
import CardView from '@/components/CardView';
import { Button } from '@/components/ui/button';
import { decideAI, evaluateBest, handName } from '@/poker/engine';
import type { GameState, Player, UserAction } from '@/poker/game';
import {
  BIG_BLIND,
  freshDeck,
  initialState,
  isBettingStage,
  performAction,
  potOf,
  startNewHand,
} from '@/poker/game';

// 座位位置（按玩家 id）
const SEAT_POS: Record<number, string> = {
  0: 'left-1/2 -translate-x-1/2 bottom-2',
  1: 'left-1/2 -translate-x-1/2 top-2',
  2: 'left-2 top-1/3',
  3: 'right-2 top-1/3',
};

export default function App() {
  const [state, setState] = useState<GameState>(() => initialState());
  const stateRef = useRef<GameState>(state);
  const [raiseTarget, setRaiseTarget] = useState(BIG_BLIND * 2);

  const dispatch = (s: GameState) => {
    stateRef.current = s;
    setState(s);
  };

  const startHand = () => {
    freshDeck();
    dispatch(startNewHand(stateRef.current));
  };

  const restart = () => {
    freshDeck();
    dispatch(startNewHand(initialState()));
  };

  const userAct = (action: UserAction) => {
    const s = stateRef.current;
    if (!isBettingStage(s.stage)) return;
    const actor = s.players[s.actorIdx];
    if (!actor || actor.isAI) return;
    dispatch(performAction(s, s.actorIdx, action));
  };

  // AI 行动调度
  useEffect(() => {
    if (!isBettingStage(state.stage)) return;
    const actor = state.players[state.actorIdx];
    if (!actor || !actor.isAI || actor.out) return;
    const t = setTimeout(() => {
      const cur = stateRef.current;
      if (!isBettingStage(cur.stage)) return;
      const p = cur.players[cur.actorIdx];
      if (!p || !p.isAI) return;
      const ai = decideAI({
        hole: p.hole,
        community: cur.community,
        toCall: Math.max(0, cur.currentBet - p.bet),
        pot: potOf(cur),
        chips: p.chips,
        bet: p.bet,
        currentBet: cur.currentBet,
        bigBlind: BIG_BLIND,
        aggr: p.aggr,
      });
      dispatch(performAction(cur, cur.actorIdx, ai));
    }, 900);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state]);

  // 轮到用户时初始化加注滑块
  const user = state.players[0];
  const isUserTurn = isBettingStage(state.stage) && state.players[state.actorIdx]?.id === 0;
  const toCall = Math.max(0, state.currentBet - user.bet);
  const minRaiseTo = state.currentBet === 0 ? BIG_BLIND : state.currentBet + BIG_BLIND;
  const maxRaiseTo = user.bet + user.chips;

  useEffect(() => {
    if (isUserTurn) {
      setRaiseTarget(Math.min(Math.max(minRaiseTo, BIG_BLIND), Math.max(maxRaiseTo, minRaiseTo)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserTurn, state.handNumber]);

  const pot = potOf(state);
  const reveal = state.stage === 'handover' || state.stage === 'gameover';
  const userHandName =
    user.hole.length === 2 && state.community.length >= 3 && !user.folded
      ? handName(evaluateBest([...user.hole, ...state.community]))
      : null;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col items-center py-4 px-2 select-none">
      {/* 顶栏 */}
      <div className="w-full max-w-5xl flex items-center justify-between mb-3">
        <h1 className="text-xl font-bold tracking-wide">
          ♠♥ 德州扑克 <span className="text-slate-400 text-sm font-normal">单机版</span>
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">盲注 {BIG_BLIND / 2}/{BIG_BLIND}</span>
          {state.handNumber > 0 && (
            <Button variant="outline" size="sm" onClick={restart}>
              重新开始
            </Button>
          )}
        </div>
      </div>

      {/* 牌桌 */}
      <div className="relative w-full max-w-5xl">
        <div className="relative h-[540px] rounded-[999px] border-8 border-amber-950 shadow-2xl table-felt overflow-hidden">
          {/* 底池与公共牌 */}
          <div className="absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 flex flex-col items-center gap-2">
            <div className="px-4 py-1 rounded-full bg-black/40 text-amber-300 font-bold text-sm">
              底池 {pot}
            </div>
            <div className="flex gap-1.5">
              {[0, 1, 2, 3, 4].map((i) => (
                <CardView key={i} card={state.community[i]} />
              ))}
            </div>
          </div>

          {/* 玩家座位 */}
          {state.players.map((p) => (
            <Seat
              key={p.id}
              player={p}
              posClass={SEAT_POS[p.id]}
              isDealer={state.dealerIdx < state.players.length && state.players[state.dealerIdx].id === p.id && state.handNumber > 0}
              isActor={isBettingStage(state.stage) && state.players[state.actorIdx]?.id === p.id}
              reveal={reveal}
              handNameText={p.id === 0 ? userHandName : null}
            />
          ))}

          {/* 结算横幅 */}
          {(state.stage === 'handover' || state.stage === 'gameover') && (
            <div className="absolute inset-0 bg-black/60 flex items-center justify-center z-20">
              <div className="bg-slate-900 border border-slate-700 rounded-xl px-8 py-6 text-center shadow-2xl max-w-md">
                <div className="text-2xl font-bold mb-2">
                  {state.result === 'won' ? '🏆 恭喜！' : state.result === 'lost' ? '💸 很遗憾' : '本局结束'}
                </div>
                <div className="text-slate-300 mb-5">{state.message}</div>
                <div className="flex gap-3 justify-center">
                  {state.stage === 'handover' && (
                    <Button onClick={startHand}>下一局</Button>
                  )}
                  {state.stage === 'gameover' && (
                    <Button onClick={restart}>再来一盘</Button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* 用户操作区 */}
        <div className="mt-3 bg-slate-900 border border-slate-800 rounded-xl p-3 flex flex-wrap items-center gap-3 justify-center">
          {state.stage === 'idle' ? (
            <Button size="lg" onClick={startHand} className="px-10">
              开始游戏
            </Button>
          ) : isUserTurn ? (
            <>
              <Button variant="destructive" onClick={() => userAct({ type: 'fold' })}>
                弃牌
              </Button>
              {toCall === 0 ? (
                <Button onClick={() => userAct({ type: 'check' })}>过牌</Button>
              ) : (
                <Button onClick={() => userAct({ type: 'call' })}>
                  跟注 {Math.min(toCall, user.chips)}
                  {toCall >= user.chips ? '（全下）' : ''}
                </Button>
              )}
              {maxRaiseTo > Math.max(minRaiseTo, BIG_BLIND) && (
                <div className="flex items-center gap-2 bg-slate-800 rounded-lg px-3 py-1.5">
                  <input
                    type="range"
                    min={Math.max(minRaiseTo, BIG_BLIND)}
                    max={maxRaiseTo}
                    step={BIG_BLIND / 2}
                    value={Math.min(raiseTarget, maxRaiseTo)}
                    onChange={(e) => setRaiseTarget(Number(e.target.value))}
                    className="w-40 accent-amber-400"
                  />
                  <Button
                    variant="secondary"
                    onClick={() =>
                      userAct({ type: 'raise', amount: Math.min(raiseTarget, maxRaiseTo) })
                    }
                  >
                    {state.currentBet === 0 ? '下注' : '加注到'} {Math.min(raiseTarget, maxRaiseTo)}
                  </Button>
                </div>
              )}
            </>
          ) : isBettingStage(state.stage) ? (
            <span className="text-slate-400 text-sm">
              {state.players[state.actorIdx]?.name} 思考中…
            </span>
          ) : null}
        </div>

        {/* 对局日志 */}
        {state.log.length > 0 && (
          <div className="mt-3 bg-slate-900 border border-slate-800 rounded-xl p-3 h-28 overflow-y-auto text-xs text-slate-400 font-mono space-y-1">
            {[...state.log].reverse().map((line, i) => (
              <div key={i}>{line}</div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------

function Seat({
  player,
  posClass,
  isDealer,
  isActor,
  reveal,
  handNameText,
}: {
  player: Player;
  posClass: string;
  isDealer: boolean;
  isActor: boolean;
  reveal: boolean;
  handNameText: string | null;
}) {
  const showCards = !player.isAI || reveal;
  const dimmed = player.folded || player.out;
  return (
    <div className={`absolute ${posClass} flex flex-col items-center gap-1 z-10`}>
      <div
        className={`flex gap-1 ${dimmed ? 'opacity-40' : ''} ${isActor ? 'ring-2 ring-amber-400 rounded-lg p-1' : ''}`}
      >
        {player.hole.length === 2 ? (
          <>
            <CardView card={player.hole[0]} hidden={!showCards} small />
            <CardView card={player.hole[1]} hidden={!showCards} small />
          </>
        ) : (
          <>
            <CardView hidden small />
            <CardView hidden small />
          </>
        )}
      </div>
      <div className="bg-black/50 rounded-full px-3 py-0.5 text-xs flex items-center gap-1.5">
        {isDealer && (
          <span className="w-4 h-4 rounded-full bg-white text-slate-900 text-[10px] font-bold flex items-center justify-center">
            D
          </span>
        )}
        <span className="font-semibold">{player.name}</span>
        {player.allIn && !dimmed && <span className="text-red-400 font-bold">全下</span>}
        <span className="text-amber-300">{player.chips}</span>
      </div>
      {player.bet > 0 && !dimmed && (
        <div className="text-[11px] bg-amber-500/90 text-slate-900 font-bold rounded-full px-2">
          {player.bet}
        </div>
      )}
      {player.lastAction && !dimmed && (
        <div className="text-[11px] text-slate-300">{player.lastAction}</div>
      )}
      {handNameText && <div className="text-[11px] text-emerald-300 font-semibold">{handNameText}</div>}
      {player.out && <div className="text-[11px] text-red-400">已出局</div>}
    </div>
  );
}
