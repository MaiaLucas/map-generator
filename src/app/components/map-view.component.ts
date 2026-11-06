import { NgTemplateOutlet } from '@angular/common';
import { Component, computed, input, output, signal } from '@angular/core';
import { MANUAL_MARKERS, MapData, MarkerType, Point, RGB, THEMES, Theme, Tile, canToggleMarker } from '../generator';

type IconKind = MarkerType | 'secret' | 'pillar' | 'hazard' | 'road';

interface IconSpot {
  kind: IconKind;
  x: number;
  y: number;
  vertical: boolean;
  value?: number;
}

interface LegendEntry {
  kind: IconKind;
  label: string;
  x: number;
  y: number;
}

/** Tamanho (em unidades do viewBox) de cada quadrado do mapa. */
const C = 32;

const mix = (a: RGB, b: RGB, p: number): RGB => [
  Math.round(a[0] * (1 - p) + b[0] * p),
  Math.round(a[1] * (1 - p) + b[1] * p),
  Math.round(a[2] * (1 - p) + b[2] * p),
];

const css = (c: RGB, a?: number): string =>
  a === undefined ? `rgb(${c[0]},${c[1]},${c[2]})` : `rgba(${c[0]},${c[1]},${c[2]},${a})`;

const DM_ONLY: MarkerType[] = ['chest', 'trap', 'encounter'];
const MARKER_ORDER: MarkerType[] = [
  'door', 'locked_door', 'stairs_up', 'stairs_down', 'camp', 'chest', 'trap', 'encounter',
];

const MANUAL_LABELS: Partial<Record<MarkerType, string>> = {
  encounter: 'Encontro',
  camp: 'Acampamento',
  chest: 'Tesouro',
  trap: 'Armadilha',
};

/** Ação pedida no menu do botão direito: colocar/remover `type` no quadrado (x, y). */
export interface MarkerAction extends Point {
  type: MarkerType;
}

interface ContextMenu {
  cell: Point;
  x: number; // posição do menu dentro da secção do mapa (px)
  y: number;
}

@Component({
  imports: [NgTemplateOutlet],
  selector: 'app-dungeon-map',
  templateUrl: './map-view.component.html',
  styleUrl: './map-view.component.scss',
})
export class MapViewComponent {
  readonly map = input.required<MapData>();
  readonly view = input<'dm' | 'player'>('dm');
  readonly theme = input<string>('stone');
  readonly showGrid = input<boolean>(true);
  readonly markerAction = output<MarkerAction>();
  readonly manualMarkers = MANUAL_MARKERS;
  readonly menu = signal<ContextMenu | null>(null);

  readonly C = C;

  readonly themeData = computed<Theme>(() => THEMES[this.theme()] ?? THEMES['stone']);

  readonly colors = computed(() => {
    const t = this.themeData();
    return {
      background: css(t.background),
      floor: css(t.floor),
      corridor: css(mix(t.floor, t.grid, 0.35)),
      hazard: css(mix(t.floor, t.danger, 0.75)),
      grid: css(t.grid, 0.9),
      ink: css(t.ink),
      inkSoft: css(t.ink, 0.35),
      inkMid: css(t.ink, 0.55),
      hatch: css(t.hatch, 0.55),
      door: css(t.door),
      pillar: css(mix(t.floor, t.hatch, 0.55)),
      road: css(mix(t.floor, t.door, 0.55)),
      tree: css(mix(t.floor, [38, 92, 40], 0.75)),
      trunk: css(t.door),
      stairs: css(mix(t.floor, [255, 255, 255], 0.45)),
    };
  });

  /** Caminhos SVG (um único <path> por camada, bem mais leve que milhares de <rect>). */
  readonly geo = computed(() => {
    const { grid: g, width: W, height: H } = this.map();
    const dm = this.view() === 'dm';
    const shown = (x: number, y: number): boolean =>
      x >= 0 && y >= 0 && x < W && y < H && g[y][x] !== Tile.WALL && (dm || g[y][x] !== Tile.SECRET_TILE);

    const cell = (x: number, y: number) => `M${x * C} ${y * C}h${C}v${C}h${-C}z`;
    const floor: string[] = [];
    const corridor: string[] = [];
    const road: string[] = [];
    const hazard: string[] = [];
    const waves: string[] = [];
    const gridLines: string[] = [];
    const walls: string[] = [];
    const hatch: string[] = [];
    const pillars: { x: number; y: number }[] = [];
    const secrets: { x: number; y: number }[] = [];

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const px = x * C;
        const py = y * C;
        const t = g[y][x];

        if (!shown(x, y)) {
          // hachuras nas paredes vizinhas a áreas abertas
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
              if ((dx || dy) && shown(x + dx, y + dy)) {
                near = true;
                break;
              }
            }
          }
          if (near) {
            for (let i = 1; i < 4; i++) {
              const o = (i * C) / 4;
              hatch.push(`M${px + o} ${py}L${px} ${py + o}M${px + C} ${py + o}L${px + o} ${py + C}`);
            }
          }
          continue;
        }

        if (t === Tile.CORRIDOR || t === Tile.SECRET_TILE) corridor.push(cell(x, y));
        else if (t === Tile.ROAD) road.push(cell(x, y));
        else if (t === Tile.HAZARD_TILE) hazard.push(cell(x, y));
        else floor.push(cell(x, y));

        if (t === Tile.HAZARD_TILE) {
          for (const f of [0.35, 0.68]) {
            waves.push(
              `M${px + C * 0.12} ${py + C * f}` +
                `Q${px + C * 0.31} ${py + C * (f - 0.12)} ${px + C * 0.5} ${py + C * f}` +
                `Q${px + C * 0.69} ${py + C * (f + 0.12)} ${px + C * 0.88} ${py + C * f}`,
            );
          }
        }
        if (t === Tile.PILLAR) pillars.push({ x: px + C / 2, y: py + C / 2 });
        if (t === Tile.SECRET_TILE) secrets.push({ x: px + C / 2, y: py + C / 2 });

        gridLines.push(cell(x, y));
        if (!shown(x, y - 1)) walls.push(`M${px} ${py}h${C}`);
        if (!shown(x, y + 1)) walls.push(`M${px} ${py + C}h${C}`);
        if (!shown(x - 1, y)) walls.push(`M${px} ${py}v${C}`);
        if (!shown(x + 1, y)) walls.push(`M${px + C} ${py}v${C}`);
      }
    }

    return {
      floor: floor.join(''),
      corridor: corridor.join(''),
      road: road.join(''),
      hazard: hazard.join(''),
      waves: waves.join(''),
      grid: gridLines.join(''),
      walls: walls.join(''),
      hatch: hatch.join(''),
      pillars,
      secrets: dm ? secrets : [],
    };
  });

  readonly rooms = computed(() =>
    this.map().rooms.map((r, i) => ({ id: i + 1, x: r.x * C + C / 2, y: r.y * C + C * 0.72 })),
  );

  readonly spots = computed<IconSpot[]>(() => {
    const m = this.map();
    const dm = this.view() === 'dm';
    return m.markers
      .filter((k) => dm || !DM_ONLY.includes(k.type))
      .sort((a, b) => MARKER_ORDER.indexOf(a.type) - MARKER_ORDER.indexOf(b.type))
      .map((k) => ({
        kind: k.type,
        x: k.x * C + C / 2,
        y: k.y * C + C / 2,
        vertical:
          m.grid[k.y][k.x - 1] === Tile.ROOM_TILE || m.grid[k.y][k.x + 1] === Tile.ROOM_TILE,
        value: k.value,
      }));
  });

  /** Legenda desenhada dentro do próprio SVG, abaixo do mapa. */
  readonly legend = computed(() => {
    const m = this.map();
    const dm = this.view() === 'dm';
    const t = this.themeData();
    const has = (type: MarkerType) => m.markers.some((k) => k.type === type);
    const hasTile = (tile: Tile) => m.grid.some((row) => row.includes(tile));

    const items: { kind: IconKind; label: string }[] = [
      { kind: 'stairs_up', label: 'Entrada' },
      { kind: 'stairs_down', label: m.markers.filter((k) => k.type === 'stairs_down').length > 1 ? 'Saídas' : 'Saída' },
    ];
    if (has('door')) items.push({ kind: 'door', label: 'Porta' });
    if (has('locked_door')) items.push({ kind: 'locked_door', label: 'Porta trancada' });
    if (hasTile(Tile.ROAD)) items.push({ kind: 'road', label: 'Estrada' });
    if (dm && hasTile(Tile.SECRET_TILE)) items.push({ kind: 'secret', label: 'Porta secreta' });
    if (hasTile(Tile.HAZARD_TILE)) {
      items.push({ kind: 'hazard', label: t.hazard_name.charAt(0).toUpperCase() + t.hazard_name.slice(1) });
    }
    if (hasTile(Tile.PILLAR)) {
      const layout = m.config.layout;
      items.push({ kind: 'pillar', label: layout === 'forest' ? 'Árvore' : layout === 'cave' ? 'Estalagmite' : 'Pilar' });
    }
    if (dm && has('chest')) items.push({ kind: 'chest', label: 'Tesouro (baú)' });
    if (has('camp')) items.push({ kind: 'camp', label: 'Acampamento' });
    if (dm && has('trap')) items.push({ kind: 'trap', label: 'Armadilha' });
    if (dm && has('encounter')) items.push({ kind: 'encounter', label: 'Encontro (nº de monstros)' });

    const pad = C * 0.4;
    const icon = C * 0.8;
    const rowH = C * 0.95;
    const maxW = m.width * C;
    const entries: LegendEntry[] = [];
    let x = pad;
    let row = 0;
    for (const item of items) {
      const w = icon + C * 0.25 + item.label.length * C * 0.21 + C * 0.6;
      if (x + w > maxW - pad && x > pad) {
        x = pad;
        row++;
      }
      entries.push({ kind: item.kind, label: item.label, x: x + icon / 2, y: C * m.height + pad + row * rowH + rowH / 2 });
      x += w;
    }
    return { entries, icon, height: pad + (row + 1) * rowH + pad * 0.5 };
  });

  readonly svgWidth = computed(() => this.map().width * C);
  readonly svgHeight = computed(() => this.map().height * C + this.legend().height);

  readonly summary = computed(() => {
    const m = this.map();
    const dm = this.view() === 'dm';
    const parts: string[] = [];
    if (m.config.layout === 'dungeon') parts.push(`${m.rooms.length} salas`);
    const camps = m.markers.filter((k) => k.type === 'camp');
    if (camps.length) parts.push(`${camps.length} acampamento${camps.length > 1 ? 's' : ''}`);
    if (dm) {
      const enc = m.markers.filter((k) => k.type === 'encounter');
      if (enc.length) {
        const monsters = enc.reduce((s, k) => s + (k.value ?? 0), 0);
        parts.push(`${enc.length} encontros (${monsters} monstros)`);
      }
      const traps = m.markers.filter((k) => k.type === 'trap');
      if (traps.length) parts.push(`${traps.length} armadilhas (CD ${traps[0].value})`);
    }
    return parts.join(' · ');
  });

  /** Botão direito no mapa: abre o menu de ações para aquele quadrado. */
  onContextMenu(event: MouseEvent): void {
    event.preventDefault();
    const svg = event.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.floor(((event.clientX - rect.left) * this.svgWidth()) / rect.width / C);
    const y = Math.floor(((event.clientY - rect.top) * this.svgHeight()) / rect.height / C);
    const cell: Point = { x, y };
    // Só abre se pelo menos um marcador puder ser colocado/removido ali.
    if (!MANUAL_MARKERS.some((t) => canToggleMarker(this.map(), cell, t))) {
      this.menu.set(null);
      return;
    }
    this.menu.set({
      cell,
      x: Math.min(event.clientX - rect.left, Math.max(0, rect.width - 190)),
      y: Math.min(event.clientY - rect.top, Math.max(0, rect.height - 170)),
    });
  }

  closeMenu(): void {
    this.menu.set(null);
  }

  manualLabel(type: MarkerType): string {
    return MANUAL_LABELS[type] ?? type;
  }

  menuHas(type: MarkerType): boolean {
    const m = this.menu();
    return !!m && this.map().markers.some((k) => k.type === type && k.x === m.cell.x && k.y === m.cell.y);
  }

  menuCan(type: MarkerType): boolean {
    const m = this.menu();
    return !!m && canToggleMarker(this.map(), m.cell, type);
  }

  choose(type: MarkerType): void {
    const m = this.menu();
    if (!m || !this.menuCan(type)) return;
    this.markerAction.emit({ x: m.cell.x, y: m.cell.y, type });
    this.closeMenu();
  }

  /** Triângulo das escadas (aponta para cima = entrada, para baixo = saída). */
  triangle(up: boolean, x: number, y: number, s: number): string {
    return up
      ? `${x},${y - s * 0.26} ${x - s * 0.2},${y + s * 0.14} ${x + s * 0.2},${y + s * 0.14}`
      : `${x},${y + s * 0.26} ${x - s * 0.2},${y - s * 0.14} ${x + s * 0.2},${y - s * 0.14}`;
  }
}
