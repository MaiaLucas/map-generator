import { Component, computed, model, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Config, THEMES } from '../generator';

@Component({
  imports: [FormsModule],
  selector: 'app-dungeon-controls',
  templateUrl: './controls.component.html',
  styleUrl: './controls.component.scss',
})
export class ControlsComponent {
  readonly options = model.required<Config>();

  readonly generate = output<void>();
  readonly reroll = output<void>();

  readonly themes = Object.entries(THEMES).map(([id, t]) => ({ id, name: t.name }));
  readonly isCave = computed(() => this.options().layout === 'cave');
  readonly isForest = computed(() => this.options().layout === 'forest');
  readonly noRooms = computed(() => this.options().layout !== 'dungeon');
  readonly pillarLabel = computed(() =>
    this.isForest() ? 'Árvores' : this.isCave() ? 'Estalagmites' : 'Pilares',
  );

  patch<K extends keyof Config>(key: K, value: Config[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }

  onLayoutChange(layout: Config['layout']): void {
    // Floresta vem com o tema verde por defeito; ao sair dela, volta ao tema de pedra.
    this.options.update((o) => ({
      ...o,
      layout,
      theme: layout === 'forest' ? 'forest' : o.theme === 'forest' ? 'stone' : o.theme,
    }));
  }
}
