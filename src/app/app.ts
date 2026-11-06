import { Component, signal } from '@angular/core';
import { ControlsComponent } from './components/controls.component';
import { MapViewComponent } from './components/map-view.component';
import { Config, MapData, generate as generateMap } from './generator';

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

  generate(): void {
    const map = generateMap(this.options());
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
}
