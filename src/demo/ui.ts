import GUI from 'lil-gui';
import { Critter } from '../creatures/factory';

export interface UiHooks {
  spawnRandom: (seed?: number) => void;
  clearSpawned: () => void;
  critters: () => Critter[];
}

/** Control panel + FPS meter. */
export function buildUi(hooks: UiHooks): { setFps: (fps: number, calls: number, tris: number) => void } {
  const gui = new GUI({ title: 'creature creator' });
  const params = {
    seed: 0,
    spawn: () => hooks.spawnRandom(params.seed > 0 ? params.seed : undefined),
    clear: () => hooks.clearSpawned(),
    outline: 1.0,
    stats: '—',
  };
  gui.add(params, 'seed', 0, 999999, 1).name('seed (0 = random)');
  gui.add(params, 'spawn').name('✨ spawn critter');
  gui.add(params, 'clear').name('clear spawned');
  gui
    .add(params, 'outline', 0, 2.5, 0.05)
    .name('outline width')
    .onChange((v: number) => {
      for (const c of hooks.critters()) {
        c.shell.materials.outlineWidth.value = 0.02 * v;
      }
    });
  const statsCtrl = gui.add(params, 'stats').name('perf').disable();

  return {
    setFps: (fps, calls, tris) => {
      params.stats = `${fps.toFixed(0)} fps · ${calls} calls · ${(tris / 1000).toFixed(0)}k tris`;
      statsCtrl.updateDisplay();
    },
  };
}
