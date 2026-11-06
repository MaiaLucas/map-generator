// Gerador de mapas de masmorras (dungeon) e cavernas (cave) para RPG de mesa.
// Port TypeScript do backend generator.py, corrigido e completado.
//
// Este arquivo é PURO (sem dependências de Node) e roda no navegador/Angular.
// Para exportar PNG no Node, veja tools/render-png.ts.

// ---------------------------------------------------------------------------
// Tipos básicos
// ---------------------------------------------------------------------------

export enum Tile {
  WALL = 0,
  ROOM_TILE = 1,
  CORRIDOR = 2,
  SECRET_TILE = 3, // porta secreta (só aparece na visão do mestre)
  HAZARD_TILE = 4, // perigo: poço, lava, água gelada... (passável, mas perigoso)
  PILLAR = 5, // pilar / estalagmite / árvore (bloqueia movimento)
  ROAD = 6, // estrada de terra (só floresta)
}

export const DIRS4: readonly (readonly [number, number])[] = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

export interface Point {
  x: number;
  y: number;
}

export interface Rect extends Point {
  w: number;
  h: number;
}

export type MarkerType =
  | 'door'
  | 'locked_door'
  | 'stairs_up' // entrada
  | 'stairs_down' // saída
  | 'chest'
  | 'trap'
  | 'encounter'
  | 'camp';

export interface Marker extends Point {
  type: MarkerType;
  /** encounter: nº de monstros | trap: CD do teste para detectar/desarmar */
  value?: number;
}

export type RGB = [number, number, number];

export interface Theme {
  name: string;
  background: RGB;
  floor: RGB;
  grid: RGB;
  ink: RGB;
  hatch: RGB;
  danger: RGB;
  door: RGB;
  hazard_name: string;
}

export const THEMES: Record<string, Theme> = {
  stone: {
    name: 'Masmorra de pedra',
    background: [226, 210, 176],
    floor: [243, 234, 211],
    grid: [196, 182, 150],
    ink: [28, 22, 18],
    hatch: [70, 58, 46],
    danger: [52, 50, 58],
    door: [120, 72, 36],
    hazard_name: 'poços',
  },
  ice: {
    name: 'Caverna de gelo',
    background: [205, 222, 235],
    floor: [232, 245, 252],
    grid: [170, 200, 220],
    ink: [24, 40, 62],
    hatch: [90, 115, 140],
    danger: [40, 90, 150],
    door: [70, 90, 120],
    hazard_name: 'água gelada',
  },
  desert: {
    name: 'Ruínas do deserto',
    background: [232, 206, 150],
    floor: [247, 228, 176],
    grid: [214, 188, 130],
    ink: [60, 38, 20],
    hatch: [130, 96, 56],
    danger: [170, 120, 60],
    door: [110, 70, 30],
    hazard_name: 'areia movediça',
  },
  swamp: {
    name: 'Pântano sombrio',
    background: [190, 200, 160],
    floor: [216, 224, 184],
    grid: [170, 182, 138],
    ink: [22, 34, 24],
    hatch: [66, 84, 56],
    danger: [60, 110, 110],
    door: [92, 72, 40],
    hazard_name: 'água turva',
  },
  volcano: {
    name: 'Covil vulcânico',
    background: [78, 62, 58],
    floor: [158, 140, 126],
    grid: [128, 110, 100],
    ink: [14, 10, 10],
    hatch: [40, 32, 30],
    danger: [232, 92, 28],
    door: [70, 40, 24],
    hazard_name: 'lava',
  },
  forest: {
    name: 'Floresta',
    background: [196, 214, 170],
    floor: [226, 238, 192],
    grid: [168, 188, 128],
    ink: [26, 42, 20],
    hatch: [62, 92, 50],
    danger: [66, 110, 70],
    door: [110, 80, 42],
    hazard_name: 'águas',
  },
};

export interface Config {
  layout?: 'dungeon' | 'cave' | 'forest';
  theme?: string;
  /** alias de theme (usado se theme não for informado) */
  environment?: string;
  width?: number; // 16..150
  height?: number; // 16..150
  rooms?: number; // nº de salas (só dungeon)
  secrets?: number; // portas secretas (só dungeon)
  danger?: number; // 0..100: % de perigo no terreno (poços, lava...)
  chest?: boolean;
  pillars?: boolean; // pilares em salas grandes / estalagmites em cavernas
  grid?: boolean;
  view?: 'dm' | 'player';
  cell?: number; // tamanho da célula em pixels
  seed?: number; // mesma seed + mesma config = mesmo mapa
  locked_doors?: number;
  traps?: number;
  exits?: number; // nº total de saídas da estrada (só floresta: 2..6)
  encounters?: boolean;
  level?: number; // nível do grupo (define a CD das armadilhas)
  group?: number; // nº de jogadores (define nº de monstros)
  difficulty?: string; // easy | medium | hard | deadly
  legend?: boolean;
  // Reservados para uso futuro (não afetam a geração)
  zone?: string;
  tier?: number;
}

export interface ResolvedConfig {
  layout: 'dungeon' | 'cave' | 'forest';
  theme: string;
  width: number;
  height: number;
  rooms: number;
  secrets: number;
  danger: number;
  chest: boolean;
  pillars: boolean;
  grid: boolean;
  view: 'dm' | 'player';
  cell: number;
  seed: number;
  locked_doors: number;
  traps: number;
  exits: number;
  encounters: boolean;
  level: number;
  group: number;
  difficulty: string;
  legend: boolean;
}

export interface MapData {
  grid: Tile[][];
  width: number;
  height: number;
  rooms: Rect[];
  doors: Point[];
  markers: Marker[];
  start: Point;
  exit: Point;
  /** Saídas extra da estrada (só floresta), além de `exit`. */
  exits: Point[];
  config: ResolvedConfig;
}

// ---------------------------------------------------------------------------
// Aleatoriedade com seed (mulberry32 — funciona bem com seed 0, ao contrário
// do xorshift anterior, que travava em 0 para sempre)
// ---------------------------------------------------------------------------

export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** float em [0, 1) */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** inteiro em [min, max) */
  nextInt(min: number, max: number): number {
    if (max <= min) return min;
    return Math.floor(this.next() * (max - min)) + min;
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(arr: readonly T[]): T {
    return arr[this.nextInt(0, arr.length)];
  }

  shuffle<T>(arr: readonly T[]): T[] {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = this.nextInt(0, i + 1);
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  sample<T>(arr: readonly T[], n: number): T[] {
    return this.shuffle(arr).slice(0, n);
  }
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

export const isOpen = (t: Tile): boolean => t !== Tile.WALL && t !== Tile.PILLAR;
const isSafeOpen = (t: Tile): boolean => isOpen(t) && t !== Tile.HAZARD_TILE;

const center = (r: Rect): Point => ({ x: r.x + (r.w >> 1), y: r.y + (r.h >> 1) });
const manhattan = (a: Point, b: Point): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const keyOf = (p: Point, W: number): number => p.y * W + p.x;

const clamp = (v: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, Math.round(v)));

function pathCells(a: Point, b: Point, xFirst: boolean): Point[] {
  let { x, y } = a;
  const cells: Point[] = [];
  const walkX = () => {
    while (x !== b.x) {
      x += b.x > x ? 1 : -1;
      cells.push({ x, y });
    }
  };
  const walkY = () => {
    while (y !== b.y) {
      y += b.y > y ? 1 : -1;
      cells.push({ x, y });
    }
  };
  if (xFirst) {
    walkX();
    walkY();
  } else {
    walkY();
    walkX();
  }
  return cells;
}

/** Distâncias (em passos) a partir de (sx, sy). -1 = inalcançável. */
function bfs(
  g: Tile[][],
  sx: number,
  sy: number,
  open: (t: Tile) => boolean = isOpen,
): Int32Array {
  const H = g.length;
  const W = g[0].length;
  const dist = new Int32Array(W * H).fill(-1);
  const queue = new Int32Array(W * H);
  let head = 0;
  let tail = 0;
  dist[sy * W + sx] = 0;
  queue[tail++] = sy * W + sx;
  while (head < tail) {
    const cur = queue[head++];
    const x = cur % W;
    const y = (cur - x) / W;
    for (const [dx, dy] of DIRS4) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      const ni = ny * W + nx;
      if (dist[ni] === -1 && open(g[ny][nx])) {
        dist[ni] = dist[cur] + 1;
        queue[tail++] = ni;
      }
    }
  }
  return dist;
}

/** true se TODAS as células "abertas" são alcançáveis a partir de (sx, sy). */
function allConnected(
  g: Tile[][],
  sx: number,
  sy: number,
  open: (t: Tile) => boolean,
): boolean {
  if (!open(g[sy][sx])) return false;
  const W = g[0].length;
  const dist = bfs(g, sx, sy, open);
  let reached = 0;
  let total = 0;
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < W; x++) {
      if (open(g[y][x])) {
        total++;
        if (dist[y * W + x] >= 0) reached++;
      }
    }
  }
  return reached === total;
}

function farthest(dist: Int32Array, W: number): Point {
  let best = 0;
  let bestIdx = 0;
  for (let i = 0; i < dist.length; i++) {
    if (dist[i] > best) {
      best = dist[i];
      bestIdx = i;
    }
  }
  return { x: bestIdx % W, y: Math.floor(bestIdx / W) };
}

function collectTiles(g: Tile[][], pred: (t: Tile, x: number, y: number) => boolean): Point[] {
  const out: Point[] = [];
  for (let y = 0; y < g.length; y++) {
    for (let x = 0; x < g[0].length; x++) {
      if (pred(g[y][x], x, y)) out.push({ x, y });
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Geração: dungeon
// ---------------------------------------------------------------------------

function makeDungeon(g: Tile[][], rng: Random, n: number, extraLoops: number): Rect[] {
  const H = g.length;
  const W = g[0].length;
  const rooms: Rect[] = [];

  for (let i = 0; i < 4000 && rooms.length < n; i++) {
    const w = rng.nextInt(4, 10);
    const h = rng.nextInt(4, 9);
    if (w > W - 3 || h > H - 3) continue;
    const x = rng.nextInt(1, W - w);
    const y = rng.nextInt(1, H - h);
    const overlaps = rooms.some(
      (r) => x - 2 < r.x + r.w && r.x - 2 < x + w && y - 2 < r.y + r.h && r.y - 2 < y + h,
    );
    if (overlaps) continue;
    rooms.push({ x, y, w, h });
  }

  for (const r of rooms) {
    for (let yy = r.y; yy < r.y + r.h; yy++) {
      for (let xx = r.x; xx < r.x + r.w; xx++) g[yy][xx] = Tile.ROOM_TILE;
    }
  }
  if (rooms.length < 2) return rooms;

  const carve = (a: Rect, b: Rect) => {
    const ca = center(a);
    const cb = center(b);
    for (const { x, y } of [ca, ...pathCells(ca, cb, rng.next() < 0.5)]) {
      if (g[y][x] === Tile.WALL) g[y][x] = Tile.CORRIDOR;
    }
  };

  // Árvore geradora: liga sempre a sala mais próxima ainda não conectada
  const connected: Rect[] = [rooms[0]];
  let remaining = rooms.slice(1);
  while (remaining.length) {
    let bestD = Infinity;
    let bestA = connected[0];
    let bestB = remaining[0];
    for (const c of connected) {
      for (const r of remaining) {
        const d = manhattan(center(c), center(r));
        if (d < bestD) {
          bestD = d;
          bestA = c;
          bestB = r;
        }
      }
    }
    carve(bestA, bestB);
    connected.push(bestB);
    remaining = remaining.filter((r) => r !== bestB);
  }

  // Ciclos extras (atalhos / rotas alternativas)
  for (let i = 0; i < extraLoops; i++) {
    const [a, b] = rng.sample(rooms, 2);
    if (manhattan(center(a), center(b)) < 30) carve(a, b);
  }
  return rooms;
}

function findDoors(g: Tile[][]): Point[] {
  const H = g.length;
  const W = g[0].length;
  const doors: Point[] = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (g[y][x] !== Tile.CORRIDOR) continue;
      for (const [dx, dy] of DIRS4) {
        if (g[y + dy][x + dx] === Tile.ROOM_TILE) {
          if (g[y + dx][x + dy] === Tile.WALL && g[y - dx][x - dy] === Tile.WALL) {
            doors.push({ x, y });
            break;
          }
        }
      }
    }
  }
  return doors;
}

// ---------------------------------------------------------------------------
// Geração: caverna (autômato celular)
// ---------------------------------------------------------------------------

function largestRegion(m: number[][]): Point[] {
  const H = m.length;
  const W = m[0].length;
  const visited = Array.from({ length: H }, () => new Array<boolean>(W).fill(false));
  let largest: Point[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (m[y][x] !== 0 || visited[y][x]) continue;
      const region: Point[] = [];
      const q: Point[] = [{ x, y }];
      visited[y][x] = true;
      for (let head = 0; head < q.length; head++) {
        const cur = q[head];
        region.push(cur);
        for (const [dx, dy] of DIRS4) {
          const nx = cur.x + dx;
          const ny = cur.y + dy;
          if (nx >= 0 && nx < W && ny >= 0 && ny < H && m[ny][nx] === 0 && !visited[ny][nx]) {
            visited[ny][nx] = true;
            q.push({ x: nx, y: ny });
          }
        }
      }
      if (region.length > largest.length) largest = region;
    }
  }
  return largest;
}

function makeCave(g: Tile[][], rng: Random, fill = 0.48): void {
  const H = g.length;
  const W = g[0].length;
  let best: Point[] = [];

  for (let attempt = 0; attempt < 8; attempt++) {
    // 1 = parede, 0 = chão
    let m: number[][] = Array.from({ length: H }, (_, y) =>
      Array.from({ length: W }, (_, x) =>
        x === 0 || x === W - 1 || y === 0 || y === H - 1 || rng.next() < fill ? 1 : 0,
      ),
    );
    for (let k = 0; k < 4; k++) {
      const next = Array.from({ length: H }, () => new Array<number>(W).fill(1));
      for (let y = 1; y < H - 1; y++) {
        for (let x = 1; x < W - 1; x++) {
          let n = 0;
          for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if (dx || dy) n += m[y + dy][x + dx];
            }
          }
          next[y][x] = n >= 5 || (m[y][x] === 1 && n >= 4) ? 1 : 0;
        }
      }
      m = next;
    }
    const region = largestRegion(m);
    if (region.length > best.length) best = region;
    if (best.length >= W * H * 0.25) break;
  }

  if (best.length < 20) {
    // Fallback: abre uma clareira no meio para nunca devolver um mapa vazio
    best = [];
    for (let y = (H >> 1) - 3; y <= (H >> 1) + 3; y++) {
      for (let x = (W >> 1) - 5; x <= (W >> 1) + 5; x++) best.push({ x, y });
    }
  }
  for (const { x, y } of best) g[y][x] = Tile.ROOM_TILE;
}

// ---------------------------------------------------------------------------
// Estrada (só floresta): caminho mais curto entre entrada e saída,
// alargado para 1–2 células. Segue o chão já aberto (clareiras),
// por isso nunca atravessa parede — e nunca é removido depois:
// perigos/pilares só ocupam ROOM_TILE, nunca ROAD.
// ---------------------------------------------------------------------------

function carveRoad(g: Tile[][], rng: Random, start: Point, exit: Point): Point[] {
  const W = g[0].length;
  const dist = bfs(g, start.x, start.y);
  if (dist[keyOf(exit, W)] < 0) return []; // inalcançável: não há estrada

  // Reconstrói o caminho descendo o gradiente de distâncias até a entrada.
  const path: Point[] = [];
  let cur = exit;
  while (cur.x !== start.x || cur.y !== start.y) {
    path.push(cur);
    const d = dist[keyOf(cur, W)];
    const next = DIRS4.map(([dx, dy]) => ({ x: cur.x + dx, y: cur.y + dy })).find(
      (p) => p.x >= 0 && p.y >= 0 && p.x < W && p.y < g.length && dist[keyOf(p, W)] === d - 1,
    );
    if (!next) return []; // não deveria acontecer; seguro
    cur = next;
  }
  path.push(start);
  path.reverse();

  for (const p of path) {
    if (g[p.y][p.x] === Tile.ROOM_TILE) g[p.y][p.x] = Tile.ROAD;
  }
  // Alarga: célula vizinha perpendicular ao sentido de marcha, quando aberta.
  for (let i = 1; i < path.length; i++) {
    if (!rng.chance(0.6)) continue;
    const a = path[i - 1];
    const b = path[i];
    const perp: Point =
      a.x !== b.x ? { x: b.x, y: b.y + (rng.chance(0.5) ? 1 : -1) } : { x: b.x + (rng.chance(0.5) ? 1 : -1), y: b.y };
    if (g[perp.y]?.[perp.x] === Tile.ROOM_TILE) g[perp.y][perp.x] = Tile.ROAD;
  }
  return path;
}

/** Ponto aberto mais próximo da borda indicada, a partir de `from`. */
function edgeTarget(
  g: Tile[][],
  from: Point,
  edge: 'north' | 'south' | 'west' | 'east',
  exclude: Point[] = [],
): Point {
  const openTiles = collectTiles(g, isOpen).filter(
    (p) => !exclude.some((e) => e.x === p.x && e.y === p.y),
  );
  const better = (a: Point, b: Point): boolean => {
    switch (edge) {
      case 'north': return a.y < b.y || (a.y === b.y && Math.abs(a.x - from.x) < Math.abs(b.x - from.x));
      case 'south': return a.y > b.y || (a.y === b.y && Math.abs(a.x - from.x) < Math.abs(b.x - from.x));
      case 'west': return a.x < b.x || (a.x === b.x && Math.abs(a.y - from.y) < Math.abs(b.y - from.y));
      case 'east': return a.x > b.x || (a.x === b.x && Math.abs(a.y - from.y) < Math.abs(b.y - from.y));
    }
  };
  return openTiles.reduce((best, p) => (better(p, best) ? p : best));
}

// ---------------------------------------------------------------------------
// Elementos de RPG: perigos, pilares, baú, armadilhas, encontros
// ---------------------------------------------------------------------------

function placeHazards(
  g: Tile[][],
  rng: Random,
  percent: number,
  protect: Set<number>,
  start: Point,
): void {
  if (percent <= 0) return;
  const W = g[0].length;
  const floor = collectTiles(g, (t) => t === Tile.ROOM_TILE);
  const target = Math.floor(floor.length * (percent / 100) * 0.3);
  let placed = 0;

  for (let guard = 0; placed < target && guard < 400 && floor.length; guard++) {
    const seed = rng.pick(floor);
    if (g[seed.y][seed.x] !== Tile.ROOM_TILE || protect.has(keyOf(seed, W))) continue;

    const size = rng.nextInt(3, 11);
    const blob: Point[] = [seed];
    g[seed.y][seed.x] = Tile.HAZARD_TILE;
    for (let i = 0; i < size * 3 && blob.length < size; i++) {
      const b = rng.pick(blob);
      const [dx, dy] = rng.pick(DIRS4);
      const nx = b.x + dx;
      const ny = b.y + dy;
      if (g[ny]?.[nx] === Tile.ROOM_TILE && !protect.has(ny * W + nx)) {
        g[ny][nx] = Tile.HAZARD_TILE;
        blob.push({ x: nx, y: ny });
      }
    }
    // Garante que continua existindo caminho seguro para todo o mapa
    if (allConnected(g, start.x, start.y, isSafeOpen)) {
      placed += blob.length;
    } else {
      for (const p of blob) g[p.y][p.x] = Tile.ROOM_TILE;
    }
  }
}

function placePillars(
  g: Tile[][],
  rng: Random,
  rooms: Rect[],
  layout: 'dungeon' | 'cave' | 'forest',
  protect: Set<number>,
  start: Point,
): void {
  const W = g[0].length;
  const tryPillar = (p: Point): void => {
    if (g[p.y]?.[p.x] !== Tile.ROOM_TILE || protect.has(keyOf(p, W))) return;
    g[p.y][p.x] = Tile.PILLAR;
    if (!allConnected(g, start.x, start.y, isSafeOpen)) g[p.y][p.x] = Tile.ROOM_TILE;
  };

  if (layout === 'dungeon') {
    for (const r of rooms) {
      if (r.w < 6 || r.h < 6 || !rng.chance(0.7)) continue;
      tryPillar({ x: r.x + 1, y: r.y + 1 });
      tryPillar({ x: r.x + r.w - 2, y: r.y + 1 });
      tryPillar({ x: r.x + 1, y: r.y + r.h - 2 });
      tryPillar({ x: r.x + r.w - 2, y: r.y + r.h - 2 });
    }
  } else {
    // Estalagmites (caverna) / árvores (floresta): só em pontos "abertos",
    // para não estreitar passagens. Floresta é mais densa.
    const floor = collectTiles(g, (t) => t === Tile.ROOM_TILE);
    const count = Math.floor(floor.length * (layout === 'forest' ? 0.03 : 0.012));
    for (let i = 0; i < count * 6 && floor.length; i++) {
      const p = rng.pick(floor);
      const open4 = DIRS4.every(([dx, dy]) => g[p.y + dy]?.[p.x + dx] === Tile.ROOM_TILE);
      if (open4) tryPillar(p);
    }
  }
}

function monstersFor(rng: Random, group: number, difficulty: string): number {
  const mult: Record<string, number> = { easy: 0.75, medium: 1, hard: 1.5, deadly: 2 };
  const m = mult[difficulty] ?? 1;
  return clamp(Math.round(group * m) + rng.nextInt(-1, 2), 1, 12);
}

/** Nº de monstros de um encontro colocado manualmente (sem variação da seed). */
export function manualEncounterSize(group: number, difficulty: string): number {
  const mult: Record<string, number> = { easy: 0.75, medium: 1, hard: 1.5, deadly: 2 };
  return clamp(Math.round(group * (mult[difficulty] ?? 1)), 1, 12);
}

/** CD de uma armadilha colocada manualmente (mesma fórmula da geração automática). */
export function manualTrapDC(level: number, difficulty: string): number {
  const bonus: Record<string, number> = { easy: 0, medium: 1, hard: 2, deadly: 3 };
  return 10 + Math.ceil(clamp(level, 1, 20) / 2) + (bonus[difficulty] ?? 1);
}

/** Tipos de marcador que podem ser colocados/removidos manualmente (menu do botão direito). */
export const MANUAL_MARKERS: readonly MarkerType[] = ['encounter', 'camp', 'chest', 'trap'];

/**
 * Pode um marcador `type` ser colocado/removido manualmente em `p`?
 * Sim se o quadrado for aberto (não parede/pilar) e não estiver ocupado
 * por outro marcador (baú, armadilha, porta, entrada/saída...).
 * Um quadrado que já tem um marcador do mesmo tipo também retorna true
 * — clicar nele o remove.
 */
export function canToggleMarker(map: MapData, p: Point, type: MarkerType): boolean {
  if (p.x < 0 || p.y < 0 || p.x >= map.width || p.y >= map.height) return false;
  if (!isOpen(map.grid[p.y][p.x])) return false;
  return map.markers.every((m) => m.x !== p.x || m.y !== p.y || m.type === type);
}

/** Atalho para encontros (compatibilidade com o uso anterior). */
export function canToggleEncounter(map: MapData, p: Point): boolean {
  return canToggleMarker(map, p, 'encounter');
}

// ---------------------------------------------------------------------------
// API principal
// ---------------------------------------------------------------------------

function resolveConfig(input: Config): ResolvedConfig {
  const c: Config = {};
  for (const [k, v] of Object.entries(input)) {
    if (v !== undefined && v !== null) (c as Record<string, unknown>)[k] = v;
  }
  const themeName = c.theme ?? c.environment ?? 'stone';
  return {
    layout: c.layout === 'cave' || c.layout === 'forest' ? c.layout : 'dungeon',
    theme: THEMES[themeName] ? themeName : 'stone',
    width: clamp(c.width ?? 40, 16, 150),
    height: clamp(c.height ?? 30, 16, 150),
    rooms: clamp(c.rooms ?? 9, 1, 60),
    secrets: clamp(c.secrets ?? 1, 0, 20),
    danger: clamp(c.danger ?? 30, 0, 100),
    chest: c.chest ?? true,
    pillars: c.pillars ?? true,
    grid: c.grid ?? true,
    view: c.view === 'player' ? 'player' : 'dm',
    cell: clamp(c.cell ?? 32, 8, 96),
    seed: c.seed !== undefined ? c.seed >>> 0 : (Math.random() * 0xffffffff) >>> 0,
    locked_doors: clamp(c.locked_doors ?? 0, 0, 30),
    traps: clamp(c.traps ?? 0, 0, 60),
    exits: clamp(c.exits ?? 4, 2, 6),
    encounters: c.encounters ?? false,
    level: clamp(c.level ?? 1, 1, 20),
    group: clamp(c.group ?? 4, 1, 10),
    difficulty: (c.difficulty ?? 'medium').toLowerCase(),
    legend: c.legend ?? true,
  };
}

export function generate(config: Config = {}): MapData {
  const cfg = resolveConfig(config);
  const rng = new Random(cfg.seed);
  const W = cfg.width;
  const H = cfg.height;
  const g: Tile[][] = Array.from({ length: H }, () => new Array<Tile>(W).fill(Tile.WALL));
  const markers: Marker[] = [];
  const isDungeon = cfg.layout === 'dungeon';

  // 1) Estrutura base
  let rooms: Rect[] = [];
  if (isDungeon) {
    rooms = makeDungeon(g, rng, cfg.rooms, 1 + Math.floor(cfg.rooms / 5) + cfg.secrets);
  } else if (cfg.layout === 'forest') {
    // Como a caverna (autômato celular), mas com chão mais aberto (clareiras)
    makeCave(g, rng, 0.42);
  } else {
    makeCave(g, rng);
  }

  // 2) Portas (só dungeon). Portas secretas só em portas "redundantes":
  //    se a porta for removida, o mapa continua 100% conectado.
  let doors = isDungeon ? findDoors(g) : [];
  if (isDungeon && rooms.length) {
    const anchor = center(rooms[0]);
    let placed = 0;
    for (const d of rng.shuffle(doors)) {
      if (placed >= cfg.secrets) break;
      g[d.y][d.x] = Tile.WALL;
      if (allConnected(g, anchor.x, anchor.y, isOpen)) {
        g[d.y][d.x] = Tile.SECRET_TILE;
        placed++;
      } else {
        g[d.y][d.x] = Tile.CORRIDOR;
      }
    }
    doors = doors.filter((d) => g[d.y][d.x] === Tile.CORRIDOR);
    rng.shuffle(doors).forEach((d, i) => {
      markers.push({ type: i < cfg.locked_doors ? 'locked_door' : 'door', x: d.x, y: d.y });
    });
  }

  // 3) Entrada e saída (o mais distantes possível)
  let start: Point;
  let exit: Point;
  let extraExits: Point[] = [];
  let startRoom: Rect | undefined;
  if (isDungeon && rooms.length >= 2) {
    startRoom = rng.pick(rooms);
    start = center(startRoom);
    const d = bfs(g, start.x, start.y);
    let bestD = -1;
    let exitRoom = rooms.find((r) => r !== startRoom)!;
    for (const r of rooms) {
      if (r === startRoom) continue;
      const dd = d[keyOf(center(r), W)];
      if (dd > bestD) {
        bestD = dd;
        exitRoom = r;
      }
    }
    exit = center(exitRoom);
  } else if (cfg.layout === 'forest') {
    // Entrada/saída nas bordas opostas (oeste/leste), perto do centro
    // vertical: é por onde a estrada atravessa a floresta.
    const openTiles = collectTiles(g, isOpen);
    const midY = H / 2;
    start = openTiles.reduce((best, p) =>
      p.x < best.x || (p.x === best.x && Math.abs(p.y - midY) < Math.abs(best.y - midY)) ? p : best,
    );
    exit = openTiles.reduce((best, p) =>
      p.x > best.x || (p.x === best.x && Math.abs(p.y - midY) < Math.abs(best.y - midY)) ? p : best,
    );
    const mainRoad = carveRoad(g, rng, start, exit);
    // Saídas extra: ramais da estrada principal para as outras bordas
    // (ordem das bordas embaralhada com a seed). `exits` conta a saída
    // principal (leste), por isso os ramais são exits - 1.
    const extra = Math.max(0, cfg.exits - 1);
    const edges: ('north' | 'south' | 'west' | 'east')[] = rng.shuffle(['north', 'south', 'west', 'east'] as const);
    for (let i = 0; i < extra && mainRoad.length > 4; i++) {
      const at = Math.min(
        mainRoad.length - 2,
        Math.max(1, Math.round(((i + 1) * mainRoad.length) / (extra + 1)) + rng.nextInt(-3, 4)),
      );
      const from = mainRoad[at];
      const target = edgeTarget(g, from, edges[i % edges.length], [start, exit, ...extraExits]);
      if ((target.x === start.x && target.y === start.y) || (target.x === exit.x && target.y === exit.y)) continue;
      if (extraExits.some((e) => e.x === target.x && e.y === target.y)) continue;
      if (carveRoad(g, rng, from, target).length > 2) extraExits.push(target);
    }
  } else {
    const any = rng.pick(collectTiles(g, isOpen));
    const a = farthest(bfs(g, any.x, any.y), W);
    const b = farthest(bfs(g, a.x, a.y), W);
    start = a;
    exit = b;
  }
  markers.push({ type: 'stairs_up', ...start });
  markers.push({ type: 'stairs_down', ...exit });
  for (const e of extraExits) markers.push({ type: 'stairs_down', ...e });

  const protect = new Set<number>([
    keyOf(start, W),
    keyOf(exit, W),
    ...extraExits.map((e) => keyOf(e, W)),
  ]);
  const occupied = new Set<number>(protect);
  for (const d of doors) occupied.add(keyOf(d, W));

  // 4) Terreno perigoso e pilares
  placeHazards(g, rng, cfg.danger, protect, start);
  if (cfg.pillars) placePillars(g, rng, rooms, cfg.layout, protect, start);

  const distFromStart = bfs(g, start.x, start.y);
  const freeFloor = (p: Point): boolean =>
    g[p.y][p.x] === Tile.ROOM_TILE && !occupied.has(keyOf(p, W));

  // 5) Baú: no ponto mais distante da entrada, de preferência encostado na parede
  if (cfg.chest) {
    let spot: Point | undefined;
    if (isDungeon && rooms.length >= 2) {
      const candidates = rooms
        .filter((r) => r !== startRoom && !(r.x <= exit.x && exit.x < r.x + r.w && r.y <= exit.y && exit.y < r.y + r.h))
        .sort((a, b) => distFromStart[keyOf(center(b), W)] - distFromStart[keyOf(center(a), W)]);
      const room = candidates[0] ?? rooms[0];
      const tiles = collectTiles(
        g,
        (_t, x, y) =>
          x >= room.x && x < room.x + room.w && y >= room.y && y < room.y + room.h,
      ).filter(freeFloor);
      const edge = tiles.filter((p) => DIRS4.some(([dx, dy]) => g[p.y + dy][p.x + dx] === Tile.WALL));
      spot = rng.pick(edge.length ? edge : tiles.length ? tiles : [center(room)]);
    } else {
      const tiles = collectTiles(g, (_t, x, y) => freeFloor({ x, y }))
        .filter((p) => manhattan(p, exit) > 4 && distFromStart[keyOf(p, W)] >= 0)
        .sort((a, b) => distFromStart[keyOf(b, W)] - distFromStart[keyOf(a, W)])
        .slice(0, 12);
      if (tiles.length) spot = rng.pick(tiles);
    }
    if (spot) {
      markers.push({ type: 'chest', ...spot });
      occupied.add(keyOf(spot, W));
    }
  }

  // 6) Armadilhas (CD = 10 + nível/2 + bônus de dificuldade)
  if (cfg.traps > 0) {
    const bonus = ({ easy: 0, medium: 1, hard: 2, deadly: 3 } as Record<string, number>)[cfg.difficulty] ?? 1;
    const dc = 10 + Math.ceil(cfg.level / 2) + bonus;
    const cands = rng
      .shuffle(
        collectTiles(
          g,
          (t, x, y) =>
            (t === Tile.ROOM_TILE || t === Tile.CORRIDOR || t === Tile.ROAD) &&
            !occupied.has(y * W + x) &&
            Math.abs(x - start.x) + Math.abs(y - start.y) >= 4,
        ),
      )
      .slice(0, cfg.traps);
    for (const p of cands) {
      markers.push({ type: 'trap', ...p, value: dc });
      occupied.add(keyOf(p, W));
    }
  }

  // 7) Encontros com monstros
  if (cfg.encounters) {
    const probs: Record<string, number> = { easy: 0.35, medium: 0.5, hard: 0.65, deadly: 0.8 };
    const prob = probs[cfg.difficulty] ?? 0.5;
    const spots: Point[] = [];
    if (isDungeon && rooms.length >= 2) {
      let chosen = rooms.filter((r) => r !== startRoom && rng.chance(prob));
      if (!chosen.length) chosen = [rng.pick(rooms.filter((r) => r !== startRoom))];
      for (const r of chosen) {
        const tiles = collectTiles(
          g,
          (_t, x, y) => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h,
        ).filter(freeFloor);
        if (tiles.length) spots.push(rng.pick(tiles));
      }
    } else {
      const floor = rng.shuffle(
        collectTiles(g, (_t, x, y) => freeFloor({ x, y })).filter((p) => manhattan(p, start) >= 6),
      );
      const want = Math.max(2, Math.round(floor.length / 150));
      for (const p of floor) {
        if (spots.length >= want) break;
        if (spots.every((s) => manhattan(s, p) >= 6)) spots.push(p);
      }
    }
    for (const p of spots) {
      markers.push({ type: 'encounter', ...p, value: monstersFor(rng, cfg.group, cfg.difficulty) });
      occupied.add(keyOf(p, W));
    }
  }

  return { grid: g, width: W, height: H, rooms, doors, markers, start, exit, exits: extraExits, config: cfg };
}
