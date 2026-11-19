import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Minus } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { MinaretPodium } from '@/components/MinaretPodium';
import { computeStandings, rankMovement, type Game, type Player } from '@/lib/tournament';

const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

interface Props {
  players: Player[];
  games: Game[];
  completedRounds: number[];
  finalRound: number | null;
}

export function Scoreboard({ players, games, completedRounds, finalRound }: Props) {
  const { t } = useLanguage();
  const latest = completedRounds[completedRounds.length - 1] ?? 0;
  const [round, setRound] = useState(latest);
  useEffect(() => setRound(latest), [latest]);

  if (completedRounds.length === 0) {
    return <p className="text-sm text-gray-500">{t('The scoreboard appears when the first round is completed.')}</p>;
  }

  const standings = computeStandings(players, games, round);
  const movement = rankMovement(players, games, round);
  const isFinal = finalRound !== null && round >= finalRound;
  const podium = standings.slice(0, 3);

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center gap-2" role="tablist" aria-label={t('Scoreboard by round')}>
        {completedRounds.map((r) => (
          <button key={r} role="tab" aria-selected={r === round} onClick={() => setRound(r)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${r === round ? 'border-brand-500 bg-brand-500/15 text-brand-300' : 'border-surface-700 text-gray-400 hover:text-white'}`}>
            {finalRound !== null && r >= finalRound ? t('Final') : `${t('After round')} ${r}`}
          </button>
        ))}
      </div>

      {isFinal && podium.length >= 3 && <MinaretPodium places={podium.map((x) => ({ name: x.name, points: `${fmt(x.points)} ${t('pts')}` }))} />}

      <div className="overflow-x-auto">
        <table className="w-full text-left text-sm">
          <thead className="text-xs uppercase text-gray-500">
            <tr>
              <th className="pb-2 pr-3">#</th><th className="pb-2 pr-3" />
              <th className="pb-2 pr-4">{t('Player')}</th>
              <th className="pb-2 pr-3 text-right">{t('Points')}</th>
              <th className="pb-2 pr-3 text-right" title="Buchholz">Bch</th>
              <th className="pb-2 text-right" title="Sonneborn-Berger">SB</th>
            </tr>
          </thead>
          <tbody>
            {standings.map((s) => {
              const m = movement.get(s.id) ?? 0;
              return (
                <tr key={s.id} className="border-t border-surface-800">
                  <td className="py-2 pr-3 font-semibold text-gray-300">{s.rank}</td>
                  <td className="py-2 pr-3" aria-label={m > 0 ? t('Moved up') : m < 0 ? t('Moved down') : t('No change')}>
                    {m > 0 ? <span className="inline-flex items-center text-xs text-success-300"><ArrowUp className="h-3 w-3" />{m}</span>
                      : m < 0 ? <span className="inline-flex items-center text-xs text-error-400"><ArrowDown className="h-3 w-3" />{-m}</span>
                        : <Minus className="h-3 w-3 text-gray-600" />}
                  </td>
                  <td className="py-2 pr-4 text-gray-100">{s.name}</td>
                  <td className="py-2 pr-3 text-right font-semibold text-brand-300">{fmt(s.points)}</td>
                  <td className="py-2 pr-3 text-right text-gray-400">{fmt(s.buchholz)}</td>
                  <td className="py-2 text-right text-gray-400">{fmt(s.sonnebornBerger)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
