import GUI from 'lil-gui';
import { Critter } from '../creatures/factory';
import { CritterDNA } from '../creatures/schema';

export interface UiHooks {
  spawnRandom: (seed?: number) => void;
  clearSpawned: () => void;
  critters: () => Critter[];
  /** Returns how many critters were spawned from the parsed DNA. */
  importDNA: (dna: CritterDNA[]) => number;
  exportDNA: () => CritterDNA[];
}

function download(filename: string, text: string): void {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

/** Accepts one DNA object or an array of them. */
function parseDNA(text: string): CritterDNA[] {
  const parsed = JSON.parse(text) as CritterDNA | CritterDNA[];
  return Array.isArray(parsed) ? parsed : [parsed];
}

/** Control panel + FPS meter + DNA import/export. */
export function buildUi(hooks: UiHooks): { setFps: (fps: number, calls: number, tris: number) => void } {
  const gui = new GUI({ title: 'creature creator' });

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.json,application/json';
  fileInput.style.display = 'none';
  document.body.appendChild(fileInput);

  const importText = (text: string, source: string): void => {
    try {
      const n = hooks.importDNA(parseDNA(text));
      params.status = `imported ${n} critter${n === 1 ? '' : 's'}`;
    } catch (e) {
      params.status = `import failed: ${(e as Error).message.slice(0, 40)}`;
      console.warn(`[import:${source}]`, e);
    }
    statusCtrl.updateDisplay();
  };
  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    file.text().then((t) => importText(t, file.name));
    fileInput.value = '';
  });

  // Drag a .json anywhere onto the page to import it.
  window.addEventListener('dragover', (e) => e.preventDefault());
  window.addEventListener('drop', (e) => {
    e.preventDefault();
    const file = e.dataTransfer?.files?.[0];
    if (file) file.text().then((t) => importText(t, file.name));
  });

  const params = {
    seed: 0,
    spawn: () => hooks.spawnRandom(params.seed > 0 ? params.seed : undefined),
    clear: () => hooks.clearSpawned(),
    outline: 1.0,
    export: () => download('critters.json', JSON.stringify(hooks.exportDNA(), null, 2)),
    import: () => fileInput.click(),
    status: 'drop a .json to import',
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
  const io = gui.addFolder('critter DNA');
  io.add(params, 'export').name('⬇ export json');
  io.add(params, 'import').name('⬆ import json…');
  const statusCtrl = io.add(params, 'status').name('io').disable();
  const statsCtrl = gui.add(params, 'stats').name('perf').disable();

  return {
    setFps: (fps, calls, tris) => {
      params.stats = `${fps.toFixed(0)} fps · ${calls} calls · ${(tris / 1000).toFixed(0)}k tris`;
      statsCtrl.updateDisplay();
    },
  };
}
