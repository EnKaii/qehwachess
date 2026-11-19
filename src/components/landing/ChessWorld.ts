import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MOROCCO_PATH, MOROCCO_VIEWBOX, projectToMorocco } from '@/lib/moroccoMap';
import { PIECE_HEIGHT, buildPiece, pieceMaterial, type PieceStyle, type PieceType } from './pieces';

export interface WorldPin { key: string; name: string; lat: number; lng: number; weight: number }
export interface ButtonSpec { key: string; type: PieceType; col: number; row: number }
export interface FrameInfo { labels: { key: string; x: number; y: number }[]; hoverPiece: string | null }
export interface Handlers {
  onPieceClick: (key: string) => void;
  onPinHover: (key: string | null) => void;
  onPinSelect: (key: string) => void;
  onFrame: (info: FrameInfo) => void;
}

const clamp = (x: number) => Math.min(1, Math.max(0, x));
const ease = (t: number) => t * t * (3 - 2 * t);
const easeOutBack = (t: number) => 1 + 2.2 * Math.pow(t - 1, 3) + 1.2 * Math.pow(t - 1, 2);
const seg = (p: number, a: number, b: number) => clamp((p - a) / (b - a));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

const BOARD = 8;
const TOP = 0.2;
const TEX = 2048;
const MAP_SCALE = (TEX * 0.84) / MOROCCO_VIEWBOX.height;
const MAP_OFF_X = (TEX - MOROCCO_VIEWBOX.width * MAP_SCALE) / 2;
const MAP_OFF_Y = (TEX - MOROCCO_VIEWBOX.height * MAP_SCALE) / 2;

interface PieceRec { key: string; group: THREE.Group; home: THREE.Vector3; dir: number; lift: number; spin: number; button: boolean; height: number; delay: number }
interface PinRec { key: string; group: THREE.Group; head: THREE.Mesh; mat: THREE.MeshStandardMaterial; ring: THREE.Mesh; pos: THREE.Vector3; idx: number; hover: number; weight: number }

const DECOR: { type: PieceType; style: PieceStyle; col: number; row: number }[] = [
  { type: 'pawn', style: 'ivory', col: 3, row: 6 }, { type: 'pawn', style: 'ivory', col: 5, row: 6 }, { type: 'pawn', style: 'ivory', col: 3, row: 4 },
  { type: 'pawn', style: 'lapis', col: 3, row: 1 }, { type: 'pawn', style: 'lapis', col: 5, row: 1 }, { type: 'pawn', style: 'lapis', col: 5, row: 3 },
];

export class ChessWorld {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(36, 1, 0.1, 100);
  private raycaster = new THREE.Raycaster();
  private pointer = new THREE.Vector2(0, 0);
  private pointerIn = false;
  private pieces: PieceRec[] = [];
  private pins: PinRec[] = [];
  private tex: THREE.CanvasTexture;
  private ctx: CanvasRenderingContext2D;
  private mapPath: Path2D;
  private mapLen: number;
  private zellige: CanvasPattern | null = null;
  private lastDraw = { o: -1, f: -1 };
  private p = 0;
  private raf = 0;
  private last = 0;
  private time = 0;
  private hoverPiece: string | null = null;
  private hoverPin: string | null = null;
  private selectedPin: string | null = null;
  private w = 1;
  private h = 1;

  constructor(private canvas: HTMLCanvasElement, buttons: ButtonSpec[], pins: WorldPin[], private handlers: Handlers) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.9;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environmentIntensity = 0.4;

    const sun = new THREE.DirectionalLight(0xffe2b0, 1.6);
    sun.position.set(-6, 11, 7);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.left = -8; sun.shadow.camera.right = 8; sun.shadow.camera.top = 8; sun.shadow.camera.bottom = -8;
    sun.shadow.bias = -0.0005;
    sun.shadow.radius = 5;
    this.scene.add(sun, new THREE.HemisphereLight(0x8fa6ff, 0x1a1208, 0.5));

    // board texture (checker + map, redrawn while the map animates)
    const c = document.createElement('canvas');
    c.width = TEX; c.height = TEX;
    this.ctx = c.getContext('2d') as CanvasRenderingContext2D;
    this.tex = new THREE.CanvasTexture(c);
    this.tex.colorSpace = THREE.SRGBColorSpace;
    this.tex.anisotropy = 8;
    this.mapPath = new Path2D(MOROCCO_PATH);
    const probe = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    probe.setAttribute('d', MOROCCO_PATH);
    this.mapLen = probe.getTotalLength();
    this.buildZellige();
    this.drawBoard(0, 0);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.9, 0.4, BOARD + 0.9), new THREE.MeshStandardMaterial({ color: 0x0f1f6e, metalness: 0.4, roughness: 0.45 }));
    slab.position.y = 0; slab.receiveShadow = true; slab.castShadow = true;
    const trim = new THREE.Mesh(new THREE.BoxGeometry(BOARD + 0.94, 0.05, BOARD + 0.94), new THREE.MeshStandardMaterial({ color: 0xd9a93d, metalness: 1, roughness: 0.3 }));
    trim.position.y = 0.04;
    const top = new THREE.Mesh(new THREE.PlaneGeometry(BOARD, BOARD), new THREE.MeshStandardMaterial({ map: this.tex, roughness: 0.78, metalness: 0 }));
    top.rotation.x = -Math.PI / 2; top.position.y = TOP + 0.002; top.receiveShadow = true;
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(60, 60), new THREE.ShadowMaterial({ opacity: 0.45 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = -0.21; ground.receiveShadow = true;
    void ground;
    this.scene.add(slab, trim, top);

    // pieces
    const sq = (v: number) => v - 3.5;
    buttons.forEach((b, i) => {
      const g = buildPiece(b.type, pieceMaterial('brass'));
      g.userData.key = b.key;
      const home = new THREE.Vector3(sq(b.col), TOP, sq(b.row));
      g.position.copy(home);
      this.scene.add(g);
      this.pieces.push({ key: b.key, group: g, home, dir: b.col < 4 ? -1 : 1, lift: 0, spin: i * 1.3, button: true, height: PIECE_HEIGHT[b.type], delay: i * 0.008 });
    });
    DECOR.forEach((d, i) => {
      const g = buildPiece(d.type, pieceMaterial(d.style));
      const home = new THREE.Vector3(sq(d.col), TOP, sq(d.row));
      g.position.copy(home);
      this.scene.add(g);
      this.pieces.push({ key: `decor-${i}`, group: g, home, dir: d.col < 4 ? -1 : 1, lift: 0, spin: 0, button: false, height: PIECE_HEIGHT[d.type], delay: 0.02 + i * 0.002 });
    });

    // city pins
    pins.forEach((pin, idx) => {
      const m = projectToMorocco(pin.lat, pin.lng);
      const u = (m.x * MAP_SCALE + MAP_OFF_X) / TEX;
      const v = (m.y * MAP_SCALE + MAP_OFF_Y) / TEX;
      const pos = new THREE.Vector3((u - 0.5) * BOARD, TOP, (v - 0.5) * BOARD);
      const mat = new THREE.MeshStandardMaterial({ color: 0xe2b24a, metalness: 1, roughness: 0.22, emissive: 0x000000 });
      const group = new THREE.Group();
      const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.04, 0.42, 12), mat);
      stem.position.y = 0.21;
      const r = 0.11 + Math.min(pin.weight, 6) * 0.014;
      const head = new THREE.Mesh(new THREE.SphereGeometry(r, 24, 16), mat);
      head.position.y = 0.44 + r * 0.6;
      stem.castShadow = true; head.castShadow = true;
      head.userData.pin = pin.key;
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.2, 0.25, 40), new THREE.MeshBasicMaterial({ color: 0xffe9a8, transparent: true, opacity: 0 }));
      ring.rotation.x = -Math.PI / 2; ring.position.y = 0.01;
      group.add(stem, head, ring);
      group.position.copy(pos);
      group.scale.setScalar(0.0001);
      this.scene.add(group);
      this.pins.push({ key: pin.key, group, head, mat, ring, pos, idx, hover: 0, weight: pin.weight });
    });

    canvas.addEventListener('pointermove', this.onMove);
    canvas.addEventListener('pointerleave', this.onLeave);
    canvas.addEventListener('click', this.onClick);
  }

  private buildZellige() {
    const t = document.createElement('canvas');
    t.width = 64; t.height = 64;
    const x = t.getContext('2d');
    if (!x) return;
    x.fillStyle = '#10228a'; x.fillRect(0, 0, 64, 64);
    x.strokeStyle = '#4a69e0'; x.lineWidth = 1.5;
    x.strokeRect(16, 16, 32, 32);
    x.save(); x.translate(32, 32); x.rotate(Math.PI / 4); x.strokeRect(-16, -16, 32, 32); x.restore();
    x.fillStyle = '#e2b24a'; x.beginPath(); x.arc(32, 32, 3, 0, Math.PI * 2); x.fill();
    this.zellige = this.ctx.createPattern(t, 'repeat');
  }

  private drawBoard(outline: number, fill: number) {
    const x = this.ctx, s = TEX / 8;
    for (let r = 0; r < 8; r += 1) for (let c = 0; c < 8; c += 1) {
      x.fillStyle = (r + c) % 2 ? '#1a33a0' : '#e8e1d0';
      x.fillRect(c * s, r * s, s, s);
      x.strokeStyle = 'rgba(10,18,53,.22)'; x.lineWidth = 2; x.strokeRect(c * s, r * s, s, s);
    }
    x.strokeStyle = '#e2b24a'; x.lineWidth = 8; x.strokeRect(4, 4, TEX - 8, TEX - 8);
    if (outline > 0 || fill > 0) {
      x.save();
      x.translate(MAP_OFF_X, MAP_OFF_Y);
      x.scale(MAP_SCALE, MAP_SCALE);
      if (fill > 0) {
        x.globalAlpha = 0.9 * fill;
        x.fillStyle = '#0a1235'; x.fill(this.mapPath);
        if (this.zellige) { x.globalAlpha = fill; x.fillStyle = this.zellige; x.fill(this.mapPath); }
        x.globalAlpha = 1;
      }
      x.lineJoin = 'round'; x.lineCap = 'round';
      x.lineWidth = 7 / MAP_SCALE;
      x.strokeStyle = '#f0c75e';
      x.shadowColor = '#e2b24a'; x.shadowBlur = 22;
      x.setLineDash([this.mapLen, this.mapLen]);
      x.lineDashOffset = this.mapLen * (1 - outline);
      x.stroke(this.mapPath);
      x.restore();
    }
    this.tex.needsUpdate = true;
    this.lastDraw = { o: outline, f: fill };
  }

  resize(w: number, h: number) {
    this.w = Math.max(1, w); this.h = Math.max(1, h);
    this.renderer.setSize(this.w, this.h, false);
    this.camera.aspect = this.w / this.h;
    this.camera.updateProjectionMatrix();
  }

  setProgress(p: number) { this.p = p; }
  get piecesLive() { return this.p > 0.42 && this.p < 0.64; }
  get pinsLive() { return this.p > 0.9; }
  select(key: string | null) { this.selectedPin = key; }

  start() { if (!this.raf) { this.last = performance.now(); this.raf = requestAnimationFrame(this.frame); } }
  stop() { cancelAnimationFrame(this.raf); this.raf = 0; }

  dispose() {
    this.stop();
    this.canvas.removeEventListener('pointermove', this.onMove);
    this.canvas.removeEventListener('pointerleave', this.onLeave);
    this.canvas.removeEventListener('click', this.onClick);
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((x) => x.dispose()); else mat?.dispose();
    });
    this.tex.dispose();
    this.renderer.dispose();
  }

  private setPointer(e: PointerEvent | MouseEvent) {
    const r = this.canvas.getBoundingClientRect();
    this.pointerIn = true;
    this.pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  }

  private pick() {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    let piece: string | null = null;
    let pin: string | null = null;
    if (this.piecesLive) {
      const hits = this.raycaster.intersectObjects(this.pieces.filter((x) => x.button).map((x) => x.group), true);
      if (hits.length) {
        let o: THREE.Object3D | null = hits[0].object;
        while (o && !o.userData.key) o = o.parent;
        piece = (o?.userData.key as string) ?? null;
      }
    }
    if (this.pinsLive) {
      const hits = this.raycaster.intersectObjects(this.pins.map((x) => x.head), false);
      if (hits.length) pin = hits[0].object.userData.pin as string;
    }
    if (piece !== this.hoverPiece) this.hoverPiece = piece;
    if (pin !== this.hoverPin) { this.hoverPin = pin; this.handlers.onPinHover(pin); }
    this.canvas.style.cursor = piece || pin ? 'pointer' : 'default';
  }

  private onMove = (e: PointerEvent) => { this.setPointer(e); this.pick(); };
  private onLeave = () => { this.pointerIn = false; this.pointer.set(0, 0); this.hoverPiece = null; if (this.hoverPin) { this.hoverPin = null; this.handlers.onPinHover(null); } };
  private onClick = (e: MouseEvent) => {
    this.setPointer(e); this.pick();
    if (this.hoverPiece) this.handlers.onPieceClick(this.hoverPiece);
    else if (this.hoverPin) this.handlers.onPinSelect(this.hoverPin);
  };

  private updateCamera() {
    const p = this.p;
    const A = { pos: new THREE.Vector3(0, 4.4, 15.5), look: new THREE.Vector3(0, 0.3, 0) };
    const B = { pos: new THREE.Vector3(0, 8.6, 10.6), look: new THREE.Vector3(0, 0.5, 0.6) };
    const C = { pos: new THREE.Vector3(3.6, 14.2, 2.1), look: new THREE.Vector3(3.6, 0, 0) };
    const t1 = ease(seg(p, 0.1, 0.46));
    const t2 = ease(seg(p, 0.62, 0.76));
    const pos = A.pos.clone().lerp(B.pos, t1).lerp(C.pos, t2);
    const look = A.look.clone().lerp(B.look, t1).lerp(C.look, t2);
    const drift = (1 - t2) * seg(p, 0.4, 0.5);
    if (this.pointerIn) { pos.x += this.pointer.x * 0.7 * drift; pos.y += this.pointer.y * 0.35 * drift; }
    this.camera.position.copy(pos);
    this.camera.lookAt(look);
  }

  private frame = (now: number) => {
    this.raf = requestAnimationFrame(this.frame);
    const dt = Math.min(0.05, (now - this.last) / 1000);
    this.last = now; this.time += dt;
    const p = this.p;
    this.updateCamera();

    const outline = ease(seg(p, 0.72, 0.84));
    const fill = ease(seg(p, 0.82, 0.9));
    if (Math.abs(outline - this.lastDraw.o) > 0.004 || Math.abs(fill - this.lastDraw.f) > 0.01) this.drawBoard(outline, fill);

    for (const pc of this.pieces) {
      const hovered = pc.key === this.hoverPiece;
      pc.lift = lerp(pc.lift, hovered ? 0.3 : 0, 1 - Math.pow(0.0005, dt));
      const slide = ease(seg(p, 0.6 + pc.delay, 0.69 + pc.delay));
      pc.group.visible = slide < 0.999;
      pc.group.position.set(pc.home.x + pc.dir * slide * 12, TOP + pc.lift, pc.home.z + slide * pc.dir * 1.5);
      if (pc.button) pc.group.rotation.y = pc.spin + this.time * (hovered ? 1.6 : 0.35) + slide * pc.dir * 2;
    }

    this.pins.forEach((pin) => {
      const r = clamp((p - (0.88 + pin.idx * 0.0045)) / 0.05);
      const rise = r <= 0 ? 0.0001 : easeOutBack(r);
      const on = pin.key === this.hoverPin || pin.key === this.selectedPin;
      pin.hover = lerp(pin.hover, on ? 1 : 0, 1 - Math.pow(0.001, dt));
      pin.group.scale.setScalar(Math.max(0.0001, rise * (1 + pin.hover * 0.35)));
      pin.group.visible = r > 0;
      pin.mat.emissive.setRGB(0.5 * pin.hover, 0.38 * pin.hover, 0.08 * pin.hover);
      const ringT = (this.time * 0.8 + pin.idx * 0.3) % 1;
      pin.ring.scale.setScalar(1 + ringT * 1.6);
      (pin.ring.material as THREE.MeshBasicMaterial).opacity = this.selectedPin === pin.key ? (1 - ringT) * 0.9 : 0;
    });

    this.renderer.render(this.scene, this.camera);

    const labels: FrameInfo['labels'] = [];
    if (this.piecesLive || (p > 0.38 && p < 0.7)) {
      for (const pc of this.pieces) {
        if (!pc.button) continue;
        const v = new THREE.Vector3(pc.group.position.x, pc.group.position.y + pc.height + 0.3, pc.group.position.z).project(this.camera);
        labels.push({ key: pc.key, x: (v.x * 0.5 + 0.5) * this.w, y: (-v.y * 0.5 + 0.5) * this.h });
      }
    }
    this.handlers.onFrame({ labels, hoverPiece: this.hoverPiece });
  };
}
