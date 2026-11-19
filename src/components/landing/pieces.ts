import * as THREE from 'three';

export type PieceType = 'pawn' | 'rook' | 'bishop' | 'queen' | 'king';
type Pt = [number, number]; // [radius, height], one board square = 1 unit

const BASE: Pt[] = [[0, 0], [0.36, 0], [0.37, 0.05], [0.34, 0.1], [0.28, 0.15], [0.22, 0.2]];

const PROFILES: Record<PieceType, Pt[]> = {
  pawn: [...BASE, [0.15, 0.32], [0.115, 0.44], [0.11, 0.5], [0.2, 0.55], [0.21, 0.58], [0.12, 0.62], [0, 0.62]],
  rook: [...BASE, [0.17, 0.35], [0.16, 0.7], [0.23, 0.78], [0.29, 0.84], [0.29, 1.0], [0, 1.0]],
  bishop: [...BASE, [0.13, 0.4], [0.105, 0.62], [0.2, 0.7], [0.23, 0.74], [0.15, 0.86], [0.19, 1.0], [0.16, 1.15], [0.09, 1.28], [0, 1.3]],
  queen: [...BASE, [0.15, 0.4], [0.12, 0.78], [0.25, 0.86], [0.2, 0.98], [0.22, 1.15], [0.3, 1.4], [0.31, 1.45], [0, 1.45]],
  king: [...BASE, [0.15, 0.4], [0.12, 0.85], [0.25, 0.93], [0.2, 1.05], [0.24, 1.28], [0.29, 1.48], [0.3, 1.52], [0, 1.52]],
};

export const PIECE_HEIGHT: Record<PieceType, number> = { pawn: 0.8, rook: 1.12, bishop: 1.42, queen: 1.62, king: 1.9 };

function lathe(points: Pt[]) {
  const curve = new THREE.SplineCurve(points.map(([r, y]) => new THREE.Vector2(r, y)));
  const smooth = curve.getPoints(points.length * 7).map((v) => new THREE.Vector2(Math.max(v.x, 0.0001), v.y));
  return new THREE.LatheGeometry(smooth, 64);
}

export type PieceStyle = 'brass' | 'ivory' | 'lapis';

export function pieceMaterial(style: PieceStyle) {
  if (style === 'brass') return new THREE.MeshStandardMaterial({ color: 0xd9a93d, metalness: 1, roughness: 0.26 });
  if (style === 'ivory') return new THREE.MeshStandardMaterial({ color: 0xece5d3, metalness: 0.05, roughness: 0.38 });
  return new THREE.MeshStandardMaterial({ color: 0x14257f, metalness: 0.25, roughness: 0.28 });
}

export function buildPiece(type: PieceType, material: THREE.Material) {
  const group = new THREE.Group();
  const add = (geo: THREE.BufferGeometry, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geo, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  add(lathe(PROFILES[type]));

  if (type === 'pawn') add(new THREE.SphereGeometry(0.17, 32, 24), 0, 0.76);
  if (type === 'rook') {
    for (let i = 0; i < 6; i += 1) {
      const a = (i / 6) * Math.PI * 2;
      const m = add(new THREE.BoxGeometry(0.12, 0.16, 0.1), Math.cos(a) * 0.22, 1.07, Math.sin(a) * 0.22);
      m.rotation.y = -a;
    }
  }
  if (type === 'bishop') add(new THREE.SphereGeometry(0.075, 24, 16), 0, 1.35);
  if (type === 'queen') {
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * Math.PI * 2;
      add(new THREE.SphereGeometry(0.055, 16, 12), Math.cos(a) * 0.27, 1.48, Math.sin(a) * 0.27);
    }
    add(new THREE.SphereGeometry(0.095, 24, 16), 0, 1.58);
  }
  if (type === 'king') {
    add(new THREE.BoxGeometry(0.085, 0.36, 0.085), 0, 1.72);
    add(new THREE.BoxGeometry(0.26, 0.085, 0.085), 0, 1.76);
  }
  return group;
}
