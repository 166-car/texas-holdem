import { rankLabel, isRedSuit } from '@/poker/engine';
import type { Card } from '@/poker/engine';

interface Props {
  card?: Card;
  hidden?: boolean;
  small?: boolean;
}

export default function CardView({ card, hidden, small }: Props) {
  const size = small ? 'w-10 h-14' : 'w-12 h-16';
  if (hidden || !card) {
    return (
      <div
        className={`${size} rounded-md border border-white/25 shadow-md card-back flex items-center justify-center shrink-0`}
      >
        <span className="text-white/50 text-xl">✦</span>
      </div>
    );
  }
  const red = isRedSuit(card.suit);
  const color = red ? 'text-red-600' : 'text-slate-900';
  return (
    <div
      className={`${size} rounded-md bg-white shadow-md flex flex-col items-center justify-center leading-none select-none shrink-0 border border-slate-200`}
    >
      <span className={`${small ? 'text-xs' : 'text-sm'} font-bold ${color}`}>
        {rankLabel(card.rank)}
      </span>
      <span className={`${small ? 'text-base' : 'text-lg'} ${color}`}>{card.suit}</span>
    </div>
  );
}
