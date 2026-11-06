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

  patch<K extends keyof Config>(key: K, value: Config[K]): void {
    this.options.update((o) => ({ ...o, [key]: value }));
  }
}
