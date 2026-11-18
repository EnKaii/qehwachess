import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, Trophy } from 'lucide-react';
import { useLanguage } from '@/context/LanguageContext';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Scoreboard } from '@/components/Scoreboard';
import { buildSwissPairs, type Game } from '@/lib/tournament';

type PairingResult = 'pending' | 'white_win' | 'black_win' | 'draw' | 'bye';

interface Pairing {
  id: string;
  round_id: string;
  white_player_id: string;
  black_player_id: string | null;
  result: PairingResult;
}

interface Round {
  id: string;
  round_number: number;
  status: 'open' | 'completed';
  pairings: Pairing[];
}

interface Entrant {
  id: string;
  name: string;
  rating: number;
}

interface RegistrationRecord {
  player_id: string;
  rating: number | null;
  player: { full_name: string } | null;
}


export function TournamentPairingsPanel({ tournamentId, isManager, format }: { tournamentId: string; isManager: boolean; format: string }) {
  const { t } = useLanguage();
  const [rounds, setRounds] = useState<Round[]>([]);
  const [entrants, setEntrants] = useState<Entrant[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const { data: roundData, error: roundError } = await supabase
      .from('tournament_rounds')
      .select('id, round_number, status')
      .eq('tournament_id', tournamentId)
      .order('round_number');
    if (roundError) throw roundError;
    const roundIds = (roundData ?? []).map((round) => round.id);
    let pairings: Pairing[] = [];
    if (roundIds.length) {
      const { data: pairingData, error: pairingError } = await supabase
        .from('tournament_pairings')
        .select('id, round_id, white_player_id, black_player_id, result')
        .in('round_id', roundIds);
      if (pairingError) throw pairingError;
      pairings = (pairingData ?? []) as Pairing[];
    }
    setRounds((roundData ?? []).map((round) => ({
      id: round.id,
      round_number: round.round_number,
      status: round.status,
      pairings: pairings.filter((pairing) => pairing.round_id === round.id),
    })));

    if (isManager) {
      const { data: registrationData, error: registrationError } = await supabase
        .from('registrations')
        .select('player_id, rating, player:profiles!registrations_player_id_fkey(full_name)')
        .eq('tournament_id', tournamentId)
        .eq('status', 'confirmed');
      if (registrationError) throw registrationError;
      setEntrants(((registrationData ?? []) as unknown as RegistrationRecord[]).map((registration) => ({
        id: registration.player_id,
        name: registration.player?.full_name ?? 'Player',
        rating: registration.rating ?? 0,
      })));
    } else {
      const ids = [...new Set(pairings.flatMap((pairing) => [pairing.white_player_id, pairing.black_player_id].filter((id): id is string => Boolean(id))))];
      if (ids.length) {
        const { data: playerData, error: playerError } = await supabase.from('profiles').select('id, full_name').in('id', ids);
        if (playerError) throw playerError;
        setEntrants((playerData ?? []).map((player) => ({ id: player.id, name: player.full_name, rating: 0 })));
      } else {
        setEntrants([]);
      }
    }
  }, [isManager, tournamentId]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    void loadData()
      .catch((loadError: unknown) => { if (active) setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [loadData]);

  useEffect(() => {
    const channel = supabase
      .channel(`tournament-live-${tournamentId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_pairings' }, () => { void loadData().catch(() => undefined); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'tournament_rounds', filter: `tournament_id=eq.${tournamentId}` }, () => { void loadData().catch(() => undefined); })
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [loadData, tournamentId]);

  const entrantById = useMemo(() => new Map(entrants.map((entrant) => [entrant.id, entrant])), [entrants]);
  const allPairings = useMemo(() => rounds.flatMap((round) => round.pairings), [rounds]);
  const players = useMemo(() => {
    const ids = isManager ? entrants.map((entrant) => entrant.id) : [...new Set(allPairings.flatMap((pairing) => [pairing.white_player_id, pairing.black_player_id].filter((id): id is string => Boolean(id))))];
    return ids.map((id) => ({ id, name: entrantById.get(id)?.name ?? t('Player'), rating: entrantById.get(id)?.rating ?? 0 }));
  }, [allPairings, entrantById, entrants, isManager, t]);
  const games = useMemo<Game[]>(() => rounds.flatMap((round) => round.pairings.map((pairing) => ({
    round: round.round_number, white: pairing.white_player_id, black: pairing.black_player_id, result: pairing.result,
  }))), [rounds]);
  const completedRounds = useMemo(() => rounds.filter((round) => round.status === 'completed').map((round) => round.round_number), [rounds]);
  const plannedRounds = Math.max(3, Math.ceil(Math.log2(Math.max(players.length, 2))));
  const finalRound = completedRounds.includes(plannedRounds) ? plannedRounds : null;
  const lastRound = rounds[rounds.length - 1];
  const roundCreationBlockReason = loading
    ? null
    : entrants.length < 2
      ? t('Need at least two confirmed participants to create a round.')
      : lastRound && lastRound.status !== 'completed'
        ? t('Enter all results in the current round before creating the next one.')
        : null;

  async function createNextRound() {
    if (format !== 'swiss' || entrants.length < 2) return;
    setSaving(true);
    setError(null);
    if (lastRound?.status !== 'completed') {
      setError(t('Enter all results in the current round before creating the next one.'));
      setSaving(false);
      return;
    }
    const generated = buildSwissPairs(entrants, games);
    if (generated.error) {
      setError(t(generated.error));
      setSaving(false);
      return;
    }
    const { error: rpcError } = await supabase.rpc('create_tournament_round', {
      p_tournament_id: tournamentId,
      p_pairings: generated.games.map((game) => ({ white_player_id: game.white, black_player_id: game.black, result: game.result })),
    });
    if (rpcError) setError(rpcError.message);
    else await loadData().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'));
    setSaving(false);
  }

  async function saveResult(pairing: Pairing, result: PairingResult) {
    if (result === 'bye') return;
    setError(null);
    const { error: updateError } = await supabase.from('tournament_pairings').update({ result }).eq('id', pairing.id);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    await loadData().catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : 'Could not load tournament pairings.'));
  }

  return (
    <Card className="p-6 sm:p-8">
      <div className="mb-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3"><div className="flex h-10 w-10 items-center justify-center rounded-lg border border-brand-500/20 bg-brand-500/10"><Trophy className="h-5 w-5 text-brand-400" /></div><div><h2 className="text-xl font-bold text-white">{t('Rounds and Standings')}</h2><p className="text-sm text-gray-500">{format === 'swiss' ? t('Basic Swiss pairings; organizers confirm results.') : t('Automatic pairings are currently available for Swiss tournaments.')}</p></div></div>
        {isManager && format === 'swiss' && <Button onClick={() => void createNextRound()} disabled={saving || entrants.length < 2 || (rounds.length > 0 && rounds[rounds.length - 1].status !== 'completed')}>{saving ? t('Creating round...') : t('Create next round')}</Button>}
      </div>
      {isManager && format === 'swiss' && roundCreationBlockReason && <p className="-mt-2 mb-4 text-sm text-gray-500">{roundCreationBlockReason} {entrants.length < 2 && `${t('Confirmed participants')}: ${entrants.length}/2`}</p>}
      {error && <div role="alert" className="mb-4 flex items-start gap-2 rounded-lg border border-error-500/20 bg-error-500/10 p-3 text-sm text-error-400"><AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />{t(error)}</div>}
      {loading ? <p className="text-sm text-gray-500">{t('Loading tournament pairings...')}</p> : (
        <>
          {rounds.map((round) => (
            <section key={round.id} className="mb-6">
              <div className="mb-3 flex items-center justify-between"><h3 className="font-semibold text-white">{t('Round')} {round.round_number}</h3><span className={`text-xs ${round.status === 'completed' ? 'text-success-300' : 'text-amber-300'}`}>{t(round.status)}</span></div>
              <div className="space-y-2">
                {round.pairings.map((pairing) => {
                  const white = entrantById.get(pairing.white_player_id)?.name ?? t('Player');
                  const black = pairing.black_player_id ? entrantById.get(pairing.black_player_id)?.name ?? t('Player') : t('Bye');
                  return (
                    <div key={pairing.id} className="grid gap-2 rounded-lg bg-surface-800/70 p-3 sm:grid-cols-[1fr_auto_1fr_auto] sm:items-center">
                      <span className="truncate text-sm text-white">{white}</span><span className="text-center text-xs text-gray-500">{pairing.result === 'bye' ? t('Bye') : '—'}</span><span className="truncate text-sm text-white">{black}</span>
                      {isManager && pairing.result !== 'bye' ? (
                        <select aria-label={t('Pairing result')} value={pairing.result} onChange={(event) => void saveResult(pairing, event.target.value as PairingResult)} className="rounded-lg border border-surface-700 bg-surface-900 px-2 py-1.5 text-sm text-white">
                          <option value="pending">{t('Result pending')}</option><option value="white_win">{t('White wins')}</option><option value="draw">{t('Draw')}</option><option value="black_win">{t('Black wins')}</option>
                        </select>
                      ) : <span className="text-right text-xs text-gray-400">{t(pairing.result)}</span>}
                    </div>
                  );
                })}
              </div>
            </section>
          ))}

          <div className="border-t border-surface-700 pt-5">
            <h3 className="mb-3 font-semibold text-white">{t('Standings')}</h3>
            <Scoreboard players={players} games={games} completedRounds={completedRounds} finalRound={finalRound} />
          </div>
        </>
      )}
    </Card>
  );
}
