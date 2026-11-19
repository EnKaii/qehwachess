import type { PieceType } from '@/components/landing/pieceShapes';

/** The Opera Game (Morphy vs. Duke of Brunswick and Count Isouard, Paris 1858), as from-to squares. */
export const OPERA_MOVES: string[] = [
  'e2e4', 'e7e5', 'g1f3', 'd7d6', 'd2d4', 'c8g4', 'd4e5', 'g4f3', 'd1f3', 'd6e5',
  'f1c4', 'g8f6', 'f3b3', 'd8e7', 'b1c3', 'c7c6', 'c1g5', 'b7b5', 'c3b5', 'c6b5',
  'c4b5', 'b8d7', 'e1c1', 'a8d8', 'd1d7', 'd8d7', 'h1d1', 'e7e6', 'b5d7', 'f6d7',
  'b3b8', 'd7b8', 'd1d8',
];

export interface Step { ply: number; fx: number; fy: number; tx: number; ty: number }
export interface GamePiece {
  id: string;
  type: PieceType;
  white: boolean;
  x0: number;
  y0: number;
  steps: Step[];
  capturedPly: number;
  /** Used by the home-page labels: which piece links where. */
  key?: string;
}

const FILES = 'abcdefgh';
const sq = (s: string): [number, number] => [FILES.indexOf(s[0]), 8 - Number(s[1])]; // x 0..7 (a..h), y 0..7 (rank 8 at top)
const BACK: PieceType[] = ['rook', 'knight', 'bishop', 'queen', 'king', 'bishop', 'knight', 'rook'];

export function buildGame(): GamePiece[] {
  const pieces: GamePiece[] = [];
  const board = new Map<string, GamePiece>();
  const put = (p: GamePiece) => { pieces.push(p); board.set(`${p.x0},${p.y0}`, p); };
  for (let x = 0; x < 8; x += 1) {
    put({ id: `bp${x}`, type: 'pawn', white: false, x0: x, y0: 1, steps: [], capturedPly: -1 });
    put({ id: `wp${x}`, type: 'pawn', white: true, x0: x, y0: 6, steps: [], capturedPly: -1 });
    put({ id: `b${FILES[x]}8`, type: BACK[x], white: false, x0: x, y0: 0, steps: [], capturedPly: -1 });
    put({ id: `w${FILES[x]}1`, type: BACK[x], white: true, x0: x, y0: 7, steps: [], capturedPly: -1 });
  }
  OPERA_MOVES.forEach((m, ply) => {
    const [fx, fy] = sq(m.slice(0, 2));
    const [tx, ty] = sq(m.slice(2, 4));
    const mover = board.get(`${fx},${fy}`);
    if (!mover) return;
    const victim = board.get(`${tx},${ty}`);
    if (victim) victim.capturedPly = ply;
    board.delete(`${fx},${fy}`);
    board.set(`${tx},${ty}`, mover);
    mover.steps.push({ ply, fx, fy, tx, ty });
    if (mover.type === 'king' && Math.abs(tx - fx) === 2) {
      const [rfx, rtx] = tx > fx ? [7, 5] : [0, 3];
      const rook = board.get(`${rfx},${fy}`);
      if (rook) {
        board.delete(`${rfx},${fy}`);
        board.set(`${rtx},${fy}`, rook);
        rook.steps.push({ ply, fx: rfx, fy, tx: rtx, ty: fy });
      }
    }
  });
  return pieces;
}

const ease = (t: number) => t * t * (3 - 2 * t);

/** Where a piece is (and how visible) at fractional move `q` (0 = start, 33 = checkmate). */
export function pieceAt(p: GamePiece, q: number) {
  const k = Math.floor(q);
  const f = q - k;
  let x = p.x0;
  let y = p.y0;
  let moving = false;
  for (const s of p.steps) {
    if (s.ply < k) { x = s.tx; y = s.ty; }
    else if (s.ply === k) {
      const e = ease(Math.min(1, f * 1.15));
      x = s.fx + (s.tx - s.fx) * e;
      y = s.fy + (s.ty - s.fy) * e;
      moving = true;
    }
  }
  let opacity = 1;
  let scale = 1;
  if (p.capturedPly >= 0) {
    if (p.capturedPly < k) opacity = 0;
    else if (p.capturedPly === k) { const t = Math.max(0, (f - 0.55) / 0.45); opacity = 1 - t; scale = 1 - 0.4 * t; }
  }
  return { x, y, opacity, scale, moving };
}
