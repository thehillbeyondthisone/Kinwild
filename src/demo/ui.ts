import GUI from 'lil-gui';
import { Critter } from '../creatures/factory';
import { CritterDNA } from '../creatures/schema';
import { dreamCritter } from '../creatures/dream';
import { encodeDNA } from './share';

export interface UiHooks {
  spawnRandom: (seed?: number) => void;
  clearSpawned: () => void;
  critters: () => Critter[];
  /** Returns how many critters were spawned from the parsed DNA. */
  importDNA: (dna: CritterDNA[]) => number;
  exportDNA: () => CritterDNA[];
  /** Replace one critter in place with edited DNA. */
  replaceCritter: (old: Critter, dna: CritterDNA) => void;
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

  // --- dream a critter (local LM Studio) ---
  const dream = gui.addFolder('🧬 dream a critter');
  const dreamParams = {
    describe: 'a grumpy mossy tank with droopy antennae',
    model: '',
    go: () => runDream(),
  };
  dream.add(dreamParams, 'describe').name('describe');
  dream.add(dreamParams, 'model').name('model (blank = loaded)');
  const goCtrl = dream.add(dreamParams, 'go').name('✨ dream it');

  async function runDream(): Promise<void> {
    goCtrl.name('dreaming…').disable();
    params.status = 'asking LM Studio…';
    statusCtrl.updateDisplay();
    try {
      const dna = await dreamCritter(dreamParams.describe, { model: dreamParams.model });
      hooks.importDNA([dna]);
      params.status = `dreamed "${dna.name}"`;
    } catch (e) {
      const msg = (e as Error).message;
      params.status = /reachable|fetch|NetworkError|Failed/i.test(msg)
        ? 'LM Studio not reachable on :1234'
        : `dream failed: ${msg.slice(0, 40)}`;
      console.warn('[dream]', e);
    }
    goCtrl.name('✨ dream it').enable();
    statusCtrl.updateDisplay();
  }

  // --- live DNA editor ---
  const editor = buildEditor(hooks, (msg) => {
    params.status = msg;
    statusCtrl.updateDisplay();
  });
  const edit = gui.addFolder('edit');
  const editParams = {
    which: '',
    open: () => {
      const list = hooks.critters();
      const target = list.find((c) => c.dna.name === editParams.which) ?? list[0];
      if (target) editor.open(target);
    },
    share: () => {
      const list = hooks.critters();
      const target = list.find((c) => c.dna.name === editParams.which) ?? list[0];
      if (!target) return;
      navigator.clipboard.writeText(encodeDNA(target.dna)).then(
        () => { params.status = 'share link copied'; statusCtrl.updateDisplay(); },
        () => { params.status = 'clipboard blocked'; statusCtrl.updateDisplay(); },
      );
    },
  };
  const whichCtrl = edit.add(editParams, 'which', ['']).name('critter');
  edit.add(editParams, 'open').name('✎ edit DNA…');
  edit.add(editParams, 'share').name('🔗 copy share link');
  // Rebuild the dropdown each time the folder opens — the roster changes.
  edit.onOpenClose((f) => {
    if (f._closed) return;
    const names = hooks.critters().map((c) => c.dna.name);
    whichCtrl.options(names.length ? names : ['']).name('critter');
  });

  const statsCtrl = gui.add(params, 'stats').name('perf').disable();

  return {
    setFps: (fps, calls, tris) => {
      params.stats = `${fps.toFixed(0)} fps · ${calls} calls · ${(tris / 1000).toFixed(0)}k tris`;
      statsCtrl.updateDisplay();
    },
  };
}

/** Floating textarea for editing one critter's DNA and re-spawning it. */
function buildEditor(hooks: UiHooks, status: (msg: string) => void) {
  const panel = document.createElement('div');
  panel.style.cssText = [
    'position:fixed', 'left:12px', 'top:12px', 'width:min(420px,44vw)',
    'background:#1a1c2ce6', 'color:#e8e8f0', 'font:12px/1.45 ui-monospace,Menlo,Consolas,monospace',
    'border:1px solid #ffffff26', 'border-radius:8px', 'padding:10px', 'display:none',
    'z-index:20', 'box-shadow:0 8px 32px #0006',
  ].join(';');
  const area = document.createElement('textarea');
  area.spellcheck = false;
  area.style.cssText = [
    'width:100%', 'height:46vh', 'background:#0f1020', 'color:#cfe8ff',
    'border:1px solid #ffffff1f', 'border-radius:5px', 'padding:8px',
    'font:inherit', 'resize:vertical', 'box-sizing:border-box',
  ].join(';');
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;margin-top:8px';
  const mkBtn = (label: string) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.style.cssText = 'flex:1;padding:6px;background:#2b2f52;color:inherit;border:1px solid #ffffff26;border-radius:5px;cursor:pointer;font:inherit';
    return b;
  };
  const applyBtn = mkBtn('apply');
  const closeBtn = mkBtn('close');
  row.append(applyBtn, closeBtn);
  panel.append(area, row);
  document.body.appendChild(panel);

  let current: Critter | null = null;
  closeBtn.onclick = () => { panel.style.display = 'none'; current = null; };
  applyBtn.onclick = () => {
    if (!current) return;
    try {
      const dna = JSON.parse(area.value) as CritterDNA;
      hooks.replaceCritter(current, dna);
      panel.style.display = 'none';
      current = null;
      status(`applied "${dna.name}"`);
    } catch (e) {
      status(`bad JSON: ${(e as Error).message.slice(0, 40)}`);
    }
  };

  return {
    open(critter: Critter) {
      current = critter;
      area.value = JSON.stringify(critter.dna, null, 2);
      panel.style.display = 'block';
    },
  };
}
