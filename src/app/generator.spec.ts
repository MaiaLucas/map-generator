import { Config, Tile, generate, isOpen } from './generator';

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
});
