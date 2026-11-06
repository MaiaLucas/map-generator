import { Config, Tile, MANUAL_MARKERS, canToggleEncounter, canToggleMarker, generate, isOpen, manualEncounterSize, manualTrapDC } from './generator';

const reachableCount = (grid: Tile[][], sx: number, sy: number): number => {
  const H = grid.length;
  const W = grid[0].length;
  const seen = new Set<number>([sy * W + sx]);
  const queue: [number, number][] = [[sx, sy]];
  for (let i = 0; i < queue.length; i++) {
    const [x, y] = queue[i];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
      if (isOpen(grid[ny][nx]) && !seen.has(ny * W + nx)) {
        seen.add(ny * W + nx);
        queue.push([nx, ny]);
      }
    }
  }
  return seen.size;
};

describe('generator', () => {
  const configs: Config[] = [
    { layout: 'dungeon', seed: 1, secrets: 2, locked_doors: 2, traps: 4, encounters: true },
    { layout: 'dungeon', seed: 0, danger: 60, rooms: 14, width: 60, height: 40 },
    { layout: 'cave', seed: 7, traps: 3, encounters: true },
    { layout: 'cave', seed: 0, width: 50, height: 40 },
    { layout: 'forest', seed: 7, traps: 3, encounters: true, theme: 'forest' },
    { layout: 'forest', seed: 0, width: 50, height: 40 },
  ];

  it('is deterministic for the same seed', () => {
    const a = generate({ seed: 5 });
    const b = generate({ seed: 5 });
    expect(a.grid).toEqual(b.grid);
    expect(a.markers).toEqual(b.markers);
  });

  it('keeps every open tile reachable from the entrance', () => {
    for (const cfg of configs) {
      const map = generate(cfg);
      const total = map.grid.flat().filter(isOpen).length;
      expect(reachableCount(map.grid, map.start.x, map.start.y)).toBe(total);
    }
  });

  it('places the entrance and the exit on open tiles', () => {
    for (const cfg of configs) {
      const map = generate(cfg);
      expect(isOpen(map.grid[map.start.y][map.start.x])).toBe(true);
      expect(isOpen(map.grid[map.exit.y][map.exit.x])).toBe(true);
    }
  });

  it('creates the requested number of traps', () => {
    const map = generate({ layout: 'dungeon', seed: 3, traps: 4 });
    expect(map.markers.filter((m) => m.type === 'trap').length).toBe(4);
  });

  it('carves a road between entrance and exit in forest layout', () => {
    for (const seed of [0, 1, 7, 42]) {
      const map = generate({ layout: 'forest', seed, theme: 'forest' });
      const road = map.grid.flat().filter((t) => t === Tile.ROAD).length;
      expect(road).toBeGreaterThan(map.width); // atravessa o mapa de oeste a leste
      expect(map.grid[map.start.y][map.start.x]).toBe(Tile.ROAD);
      expect(map.grid[map.exit.y][map.exit.x]).toBe(Tile.ROAD);
      expect(map.start.x).toBeLessThan(map.exit.x);
    }
  });

  it('does not carve roads outside forest layout', () => {
    for (const layout of ['dungeon', 'cave'] as const) {
      const map = generate({ layout, seed: 7 });
      expect(map.grid.flat().includes(Tile.ROAD)).toBe(false);
    }
  });

  it('adds extra road exits as branches to other edges', () => {
    for (const seed of [0, 1, 7, 42]) {
      const map = generate({ layout: 'forest', seed, theme: 'forest', exits: 5 });
      const downs = map.markers.filter((m) => m.type === 'stairs_down');
      expect(downs.length).toBe(5); // saída principal + 4 ramais
      expect(map.exits.length).toBe(4);
      for (const e of map.exits) {
        expect(map.grid[e.y][e.x]).toBe(Tile.ROAD);
      }
    }
    const two = generate({ layout: 'forest', seed: 7, exits: 2 });
    expect(two.markers.filter((m) => m.type === 'stairs_down').length).toBe(2);
    expect(two.exits.length).toBe(1);
  });

  it('allows manual encounters only on free open squares', () => {
    const map = generate({ layout: 'dungeon', seed: 7, encounters: true, chest: true });
    // Parede: não
    const wall = map.grid.flatMap((row, y) => row.map((t, x) => ({ t, x, y }))).find((c) => c.t === Tile.WALL)!;
    expect(canToggleEncounter(map, wall)).toBe(false);
    // Entrada/saída (ocupadas): não
    expect(canToggleEncounter(map, map.start)).toBe(false);
    expect(canToggleEncounter(map, map.exit)).toBe(false);
    // Quadrado livre: sim
    const free = map.grid.flatMap((row, y) => row.map((t, x) => ({ t, x, y })))
      .find((c) => c.t === Tile.ROOM_TILE && !map.markers.some((m) => m.x === c.x && m.y === c.y)
        && !(c.x === map.start.x && c.y === map.start.y) && !(c.x === map.exit.x && c.y === map.exit.y))!;
    expect(canToggleEncounter(map, free)).toBe(true);
    // Quadrado que já tem encontro: sim (clicar remove)
    const enc = map.markers.find((m) => m.type === 'encounter');
    if (enc) expect(canToggleEncounter(map, enc)).toBe(true);
  });

  it('sizes manual encounters by group and difficulty', () => {
    expect(manualEncounterSize(4, 'medium')).toBe(4);
    expect(manualEncounterSize(4, 'deadly')).toBe(8);
    expect(manualEncounterSize(4, 'easy')).toBe(3);
    expect(manualEncounterSize(1, 'easy')).toBe(1);
  });

  it('offers exactly the manual marker types in the right-click menu', () => {
    expect([...MANUAL_MARKERS]).toEqual(['encounter', 'camp', 'chest', 'trap']);
  });

  it('allows camp/treasure/trap only on free open squares', () => {
    const map = generate({ layout: 'dungeon', seed: 7, chest: false, traps: 0, encounters: false });
    const wall = map.grid.flatMap((row, y) => row.map((t, x) => ({ t, x, y }))).find((c) => c.t === Tile.WALL)!;
    const free = map.grid.flatMap((row, y) => row.map((t, x) => ({ t, x, y })))
      .find((c) => c.t === Tile.ROOM_TILE && !map.markers.some((m) => m.x === c.x && m.y === c.y)
        && !(c.x === map.start.x && c.y === map.start.y) && !(c.x === map.exit.x && c.y === map.exit.y))!;
    for (const type of ['camp', 'chest', 'trap', 'encounter'] as const) {
      expect(canToggleMarker(map, wall, type)).toBe(false);
      expect(canToggleMarker(map, map.start, type)).toBe(false);
      expect(canToggleMarker(map, free, type)).toBe(true);
    }
    // Um quadrado ocupado por um tipo não aceita outro tipo, mas aceita remover o seu.
    const withCamp = { ...map, markers: [...map.markers, { type: 'camp' as const, x: free.x, y: free.y }] };
    expect(canToggleMarker(withCamp, free, 'camp')).toBe(true);
    expect(canToggleMarker(withCamp, free, 'trap')).toBe(false);
    expect(canToggleMarker(withCamp, free, 'encounter')).toBe(false);
  });

  it('sizes manual trap DC by level and difficulty', () => {
    expect(manualTrapDC(3, 'medium')).toBe(13); // 10 + ceil(3/2) + 1
    expect(manualTrapDC(1, 'easy')).toBe(11);
    expect(manualTrapDC(10, 'deadly')).toBe(18);
  });
});
