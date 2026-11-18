import { describe, expect, it } from 'vitest';
import { buildSwissPairs, computeStandings, rankMovement, type Game, type Player } from './tournament';

const mk = (n: number): Player[] => Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `P${i + 1}`, rating: 2000 - i * 50 }));
const g = (round: number, white: string, black: string | null, result: Game['result']): Game => ({ round, white, black, result });

describe('standings', () => {
  it('scores wins, draws and byes', () => {
    const s = computeStandings(mk(3), [g(1, 'p1', 'p2', 'white_win'), g(1, 'p3', null, 'bye')]);
    expect(s.find((x) => x.id === 'p1')!.points).toBe(1);
    expect(s.find((x) => x.id === 'p3')!.points).toBe(1);
    expect(s.find((x) => x.id === 'p2')!.points).toBe(0);
  });
  it('breaks ties with Buchholz before rating', () => {
    const players = mk(4);
    const games = [g(1, 'p1', 'p2', 'white_win'), g(1, 'p3', 'p4', 'white_win'), g(2, 'p4', 'p1', 'black_win'), g(2, 'p2', 'p3', 'draw')];
    const s = computeStandings(players, games);
    expect(s[0].id).toBe('p1');
    const tied = s.filter((x) => x.points === 1.5).map((x) => x.id);
    expect(tied).toContain('p3');
  });
  it('gives the scoreboard after a given round', () => {
    const games = [g(1, 'p1', 'p2', 'white_win'), g(2, 'p2', 'p1', 'white_win')];
    expect(computeStandings(mk(2), games, 1)[0].id).toBe('p1');
    expect(computeStandings(mk(2), games, 1)[0].points).toBe(1);
  });
  it('reports rank movement', () => {
    const games = [g(1, 'p1', 'p2', 'white_win'), g(2, 'p2', 'p1', 'white_win')];
    const mv = rankMovement(mk(2), games, 2);
    expect(mv.get('p2')).toBe(1);
    expect(mv.get('p1')).toBe(0);
  });
});

describe('swiss pairing', () => {
  it('pairs round 1 top half vs bottom half', () => {
    const r = buildSwissPairs(mk(4), []);
    const sets = r.games.map((x) => new Set([x.white, x.black]));
    expect(sets).toContainEqual(new Set(['p1', 'p3']));
    expect(sets).toContainEqual(new Set(['p2', 'p4']));
  });
  it('gives a bye to odd fields, never twice', () => {
    const r1 = buildSwissPairs(mk(5), []);
    expect(r1.games.filter((x) => x.result === 'bye')).toHaveLength(1);
    const games: Game[] = r1.games.map((x) => ({ round: 1, ...x, result: x.result === 'bye' ? 'bye' : 'white_win' }));
    const r2 = buildSwissPairs(mk(5), games);
    const bye1 = r1.games.find((x) => x.result === 'bye')!.white;
    expect(r2.games.find((x) => x.result === 'bye')!.white).not.toBe(bye1);
  });
  it('never repeats opponents across a full tournament and balances colors', () => {
    const players = mk(8);
    const games: Game[] = [];
    for (let round = 1; round <= 5; round += 1) {
      const r = buildSwissPairs(players, games);
      expect(r.error).toBeNull();
      for (const x of r.games) {
        const prev = games.some((o) => o.black && ((o.white === x.white && o.black === x.black) || (o.white === x.black && o.black === x.white)));
        expect(prev).toBe(false);
        games.push({ round, ...x, result: x.white < (x.black ?? '') ? 'white_win' : 'black_win' });
      }
    }
    for (const pl of players) {
      const w = games.filter((x) => x.white === pl.id).length;
      const b = games.filter((x) => x.black === pl.id).length;
      expect(Math.abs(w - b)).toBeLessThanOrEqual(1);
    }
  });
  it('errors when no legal pairing exists', () => {
    const games = [g(1, 'p1', 'p2', 'draw')];
    expect(buildSwissPairs(mk(2), games).error).not.toBeNull();
  });
});
