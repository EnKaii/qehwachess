// Flat, geometric piece set (100x100 viewBox). Trusted constants, rendered with dangerouslySetInnerHTML.
export type PieceType = 'pawn' | 'rook' | 'knight' | 'bishop' | 'queen' | 'king';
export const PIECE_SHAPES: Record<PieceType, string> = {
  "pawn": "<circle cx=\"50\" cy=\"31\" r=\"13\"/><rect x=\"36\" y=\"45\" width=\"28\" height=\"7\" rx=\"3.5\"/><path d=\"M39 82C41 67 45 57 46 52H54C55 57 59 67 61 82Z\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>",
  "rook": "<path d=\"M30 15H41V24H45.5V15H54.5V24H59V15H70V38L63 44V70L70 82H30L37 70V44L30 38Z\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>",
  "bishop": "<path d=\"M50 12C62 22 68 34 62 45C60 49 57 51 55 53H45C43 51 40 49 38 45C32 34 38 22 50 12Z\"/><circle cx=\"50\" cy=\"9\" r=\"4.2\"/><path d=\"M45 26L55 38\" fill=\"none\"/><rect x=\"37\" y=\"53\" width=\"26\" height=\"7\" rx=\"3.5\"/><path d=\"M40 82C42 71 44 64 46 60H54C56 64 58 71 60 82Z\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>",
  "queen": "<path d=\"M25 32L35 58L38 30L50 56L62 30L65 58L75 32L70 68H30Z\"/><circle cx=\"25\" cy=\"28\" r=\"4\"/><circle cx=\"38\" cy=\"25\" r=\"4\"/><circle cx=\"50\" cy=\"21\" r=\"4.2\"/><circle cx=\"62\" cy=\"25\" r=\"4\"/><circle cx=\"75\" cy=\"28\" r=\"4\"/><path d=\"M33 68H67L62 82H38Z\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>",
  "king": "<rect x=\"47\" y=\"5\" width=\"6\" height=\"22\" rx=\"1.5\"/><rect x=\"40\" y=\"11\" width=\"20\" height=\"6\" rx=\"1.5\"/><path d=\"M32 44C32 32 42 29 50 34C58 29 68 32 68 44L64 66H36Z\"/><path d=\"M35 66H65L61 82H39Z\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>",
  "knight": "<path d=\"M30 82C31 66 34 56 42 49C38 49 32 46 29 41C27 38 28 35 31 32L40 22L42 12L49 19C56 17 66 22 71 32C77 44 73 64 72 82Z\"/><circle cx=\"53\" cy=\"30\" r=\"2.6\" style=\"fill:var(--ink);stroke:none\"/><rect x=\"24\" y=\"82\" width=\"52\" height=\"9\" rx=\"4\"/>"
};
