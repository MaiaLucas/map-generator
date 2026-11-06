import { Component, signal } from '@angular/core';
import { ControlsComponent } from './components/controls.component';
import { MapViewComponent, MarkerAction } from './components/map-view.component';
import {
  Config,
  MapData,
  Marker,
  canToggleMarker,
  generate as generateMap,
  manualEncounterSize,
  manualTrapDC,
} from './generator';

@Component({
  imports: [ControlsComponent, MapViewComponent],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  readonly options = signal<Config>({
    layout: 'dungeon',
    theme: 'stone',
    width: 44,
    height: 30,
    rooms: 8,
    secrets: 2,
    locked_doors: 1,
    traps: 3,
    exits: 4,
    danger: 30,
    chest: true,
    pillars: true,
    encounters: true,
    group: 4,
    level: 3,
    difficulty: 'medium',
    grid: true,
    view: 'dm',
    seed: 7,
  });

  readonly map = signal<MapData>(generateMap(this.options()));

  /** Marcadores colocados manualmente (sobrevivem a uma nova geração, se o quadrado continuar aberto). */
  readonly manualMarkers = signal<Marker[]>([]);

  generate(): void {
    let map = generateMap(this.options());
    // Reaplica os marcadores manuais no novo mapa (só onde continuarem válidos).
    const manual = this.manualMarkers().filter(
      (p) =>
        canToggleMarker(map, p, p.type) &&
        !map.markers.some((m) => m.type === p.type && m.x === p.x && m.y === p.y),
    );
    if (manual.length) map = { ...map, markers: [...map.markers, ...manual] };
    this.manualMarkers.set(manual);
    this.map.set(map);
    // Mostra no formulário a seed realmente usada (útil quando o campo ficou vazio)
    if (this.options().seed !== map.config.seed) {
      this.options.update((o) => ({ ...o, seed: map.config.seed }));
    }
  }

  reroll(): void {
    this.options.update((o) => ({ ...o, seed: (o.seed ?? 0) + 1 }));
    this.generate();
  }

  /** Ação do menu do botão direito: coloca ou remove o marcador escolhido no quadrado. */
  toggleMarker(action: MarkerAction): void {
    const o = this.options();
    const type = action.type;
    const p = { x: action.x, y: action.y };
    const m = this.map();
    if (!canToggleMarker(m, p, type)) return;
    const existing = m.markers.find((k) => k.type === type && k.x === p.x && k.y === p.y);
    if (existing) {
      this.map.set({ ...m, markers: m.markers.filter((k) => k !== existing) });
      this.manualMarkers.update((list) => list.filter((k) => !(k.type === type && k.x === p.x && k.y === p.y)));
      return;
    }
    const difficulty = o.difficulty ?? 'medium';
    const marker: Marker = {
      type,
      x: p.x,
      y: p.y,
      // Encontro: nº de monstros; armadilha: CD de detecção/desarmar. Os outros não têm valor.
      value:
        type === 'encounter'
          ? manualEncounterSize(o.group ?? 4, difficulty)
          : type === 'trap'
            ? manualTrapDC(o.level ?? 1, difficulty)
            : undefined,
    };
    this.map.set({ ...m, markers: [...m.markers, marker] });
    this.manualMarkers.update((list) => [...list, marker]);
  }
}
