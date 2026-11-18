export type PairingResult = 'pending' | 'white_win' | 'black_win' | 'draw' | 'bye';

export interface Player {
  id: string;
  name: string;
  rating: number;
}

export interface Game {
  round: number;
  white: string;
  black: string | null;
  result: PairingResult;
}

export interface Standing extends Player {
  rank: number;
  points: number;
  wins: number;
  played: number;
  buchholz: number;
  sonnebornBerger: number;
}

export interface PlannedGame {
  white: string;
  black: string | null;
  result: PairingResult;
}

const decided = (g: Game) => g.result !== 'pending';

/** Points per player. Bye = 1. Pending games score nothing. */
export function computePoints(games: Game[]): Map<string, number> {
  const pts = new Map<string, number>();
  const add = (id: string, v: number) => pts.set(id, (pts.get(id) ?? 0) + v);
  for (const g of games) {
    if (g.result === 'bye') add(g.white, 1);
    else if (g.result === 'white_win') add(g.white, 1);
    else if (g.result === 'black_win' && g.black) add(g.black, 1);
    else if (g.result === 'draw' && g.black) {
      add(g.white, 0.5);
      add(g.black, 0.5);
    }
  }
  return pts;
}

/**
 * Standings with tiebreaks: points, Buchholz, Sonneborn-Berger, wins, rating, name.
 * Pass `upToRound` to get the scoreboard as it stood at the end of that round.
 */
export function computeStandings(players: Player[], allGames: Game[], upToRound?: number): Standing[] {
  const games = allGames.filter((g) => (upToRound === undefined || g.round <= upToRound) && decided(g));
  const pts = computePoints(games);
  const p = (id: string) => pts.get(id) ?? 0;

  const rows = players.map((pl) => {
    let wins = 0;
    let played = 0;
    let buchholz = 0;
    let sb = 0;
    for (const g of games) {
      if (g.result === 'bye') {
        if (g.white === pl.id) {
          wins += 1;
          played += 1;
        }
        continue;
      }
      if (!g.black || (g.white !== pl.id && g.black !== pl.id)) continue;
      const opp = g.white === pl.id ? g.black : g.white;
      played += 1;
      buchholz += p(opp);
      const mine = g.result === 'draw' ? 0.5 : (g.result === 'white_win') === (g.white === pl.id) ? 1 : 0;
      if (mine === 1) wins += 1;
      sb += mine * p(opp);
    }
    return { ...pl, rank: 0, points: p(pl.id), wins, played, buchholz, sonnebornBerger: sb };
  });

  rows.sort(
    (a, b) =>
      b.points - a.points ||
      b.buchholz - a.buchholz ||
      b.sonnebornBerger - a.sonnebornBerger ||
      b.wins - a.wins ||
      b.rating - a.rating ||
      a.name.localeCompare(b.name),
  );
  rows.forEach((r, i) => {
    const prev = rows[i - 1];
    const tied =
      prev &&
      prev.points === r.points &&
      prev.buchholz === r.buchholz &&
      prev.sonnebornBerger === r.sonnebornBerger &&
      prev.wins === r.wins;
    r.rank = tied ? prev.rank : i + 1;
  });
  return rows;
}

/** Rank change of each player vs the previous round (positive = moved up). */
export function rankMovement(players: Player[], games: Game[], round: number): Map<string, number> {
  const now = computeStandings(players, games, round);
  const before = new Map(computeStandings(players, games, round - 1).map((s) => [s.id, s.rank]));
  return new Map(now.map((s) => [s.id, round <= 1 ? 0 : (before.get(s.id) ?? s.rank) - s.rank]));
}

export interface SwissResult {
  error: string | null;
  games: PlannedGame[];
}

/**
 * Swiss pairing with backtracking (no dead ends while a legal pairing exists),
 * no repeat opponents, one bye per player, and color balancing.
 */
export function buildSwissPairs(players: Player[], games: Game[]): SwissResult {
  if (players.length < 2) return { error: 'At least two checked-in players are needed.', games: [] };

  const pts = computePoints(games);
  const score = (id: string) => pts.get(id) ?? 0;
  const ranked = [...players].sort(
    (a, b) => score(b.id) - score(a.id) || b.rating - a.rating || a.name.localeCompare(b.name),
  );

  const met = new Map<string, Set<string>>();
  const hadBye = new Set<string>();
  const colorDiff = new Map<string, number>(); // whites - blacks
  const lastColor = new Map<string, 'w' | 'b'>();
  for (const g of [...games].sort((a, b) => a.round - b.round)) {
    if (!g.black) {
      if (g.result === 'bye') hadBye.add(g.white);
      continue;
    }
    if (!met.has(g.white)) met.set(g.white, new Set());
    if (!met.has(g.black)) met.set(g.black, new Set());
    met.get(g.white)!.add(g.black);
    met.get(g.black)!.add(g.white);
    colorDiff.set(g.white, (colorDiff.get(g.white) ?? 0) + 1);
    colorDiff.set(g.black, (colorDiff.get(g.black) ?? 0) - 1);
    lastColor.set(g.white, 'w');
    lastColor.set(g.black, 'b');
  }

  const out: PlannedGame[] = [];
  let pool = [...ranked];

  if (pool.length % 2 === 1) {
    const idx = [...pool.keys()].reverse().find((i) => !hadBye.has(pool[i].id));
    if (idx === undefined) return { error: 'Every player already had a bye.', games: [] };
    out.push({ white: pool[idx].id, black: null, result: 'bye' });
    pool = pool.filter((_, i) => i !== idx);
  }

  const noGamesYet = games.length === 0;
  if (noGamesYet) {
    // Round 1: top half vs bottom half.
    const half = pool.length / 2;
    for (let i = 0; i < half; i += 1) {
      const [a, b] = [pool[i], pool[i + half]];
      // Alternate who gets white by board so the top seed isn't always white.
      out.push(i % 2 === 0 ? { white: a.id, black: b.id, result: 'pending' } : { white: b.id, black: a.id, result: 'pending' });
    }
    return { error: null, games: out };
  }

  const wantsSameColor = (a: string, b: string) => {
    const da = colorDiff.get(a) ?? 0;
    const db = colorDiff.get(b) ?? 0;
    return (da >= 1 && db >= 1) || (da <= -1 && db <= -1);
  };

  let budget = 50000;
  const solve = (rest: Player[], strict: boolean): PlannedGame[] | null => {
    if (rest.length === 0) return [];
    if (budget-- <= 0) return null;
    const [first, ...others] = rest;
    const cands = others
      .map((pl, i) => ({ pl, i }))
      .filter(({ pl }) => !met.get(first.id)?.has(pl.id))
      .filter(({ pl }) => !strict || !wantsSameColor(first.id, pl.id))
      .sort((a, b) => Math.abs(score(first.id) - score(a.pl.id)) - Math.abs(score(first.id) - score(b.pl.id)) || a.i - b.i);
    for (const { pl, i } of cands) {
      const sub = solve(others.filter((_, j) => j !== i), strict);
      if (sub) return [assignColors(first, pl), ...sub];
    }
    return null;
  };

  const assignColors = (a: Player, b: Player): PlannedGame => {
    const da = colorDiff.get(a.id) ?? 0;
    const db = colorDiff.get(b.id) ?? 0;
    let aWhite: boolean;
    if (da !== db) aWhite = da < db;
    else if (lastColor.get(a.id) !== lastColor.get(b.id)) aWhite = lastColor.get(a.id) === 'b';
    else aWhite = true;
    return aWhite ? { white: a.id, black: b.id, result: 'pending' } : { white: b.id, black: a.id, result: 'pending' };
  };

  const paired = solve(pool, true) ?? ((budget = 50000), solve(pool, false));
  if (!paired) return { error: 'No pairing exists without repeating an opponent.', games: [] };
  return { error: null, games: [...out, ...paired] };
}
