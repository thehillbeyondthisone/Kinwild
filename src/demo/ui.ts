import GUI from 'lil-gui';
import { Critter } from '../creatures/factory';
import { CritterDNA } from '../creatures/schema';
import { dreamCritter, listModels } from '../creatures/dream';
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
  /** Called when the panel changes the selection (dropdown pick). */
  onSelect: (critter: Critter | null) => void;
}

export interface Ui {
  setFps: (fps: number, calls: number, tris: number) => void;
  /** Point the panel at a critter — called when one is clicked in the scene. */
  setSelected: (critter: Critter | null) => void;
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
export function buildUi(hooks: UiHooks): Ui {
  const gui = new GUI({ title: 'creature creator' });
  let selected: Critter | null = null;

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
    exportOne: () => {
      if (!selected) {
        setStatus('click a critter first');
        return;
      }
      download(`${selected.dna.name || 'critter'}.json`, JSON.stringify(selected.dna, null, 2));
      setStatus(`exported ${selected.dna.name}`);
    },
    import: () => fileInput.click(),
    status: 'click a critter to select it',
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
  io.add(params, 'exportOne').name('⬇ export selected');
  io.add(params, 'export').name('⬇ export all');
  io.add(params, 'import').name('⬆ import json…');
  const statusCtrl = io.add(params, 'status').name('io').disable();
  function setStatus(msg: string): void {
    params.status = msg;
    statusCtrl.updateDisplay();
  }

  // --- dream a critter (local LM Studio) ---
  const WHATEVER_IS_LOADED = '(whatever is loaded)';
  const dream = gui.addFolder('🧬 dream a critter');
  const dreamParams = {
    describe: 'a grumpy mossy tank with droopy antennae',
    model: WHATEVER_IS_LOADED,
    go: () => runDream(),
  };
  dream.add(dreamParams, 'describe').name('describe');
  let modelCtrl = dream.add(dreamParams, 'model', [WHATEVER_IS_LOADED]).name('model');
  let goCtrl = dream.add(dreamParams, 'go').name('✨ dream it');
  let modelIds: string[] = [];

  function setModelOptions(ids: string[]): void {
    if (ids.join() === modelIds.join()) return;
    modelIds = ids;
    const opts = [WHATEVER_IS_LOADED, ...ids];
    if (!opts.includes(dreamParams.model)) dreamParams.model = WHATEVER_IS_LOADED;
    modelCtrl = modelCtrl.options(opts).name('model');
    // options() destroys the controller and appends the replacement, so the
    // button has to be rebuilt too or it would end up above the dropdown.
    goCtrl.destroy();
    goCtrl = dream.add(dreamParams, 'go').name('✨ dream it');
  }

  function refreshModels(): void {
    listModels().then(setModelOptions, () => setModelOptions([]));
  }
  refreshModels();
  // Re-check on open: models get loaded and unloaded while the demo runs.
  dream.onOpenClose((f) => {
    if (!f._closed) refreshModels();
  });

  async function runDream(): Promise<void> {
    goCtrl.name('dreaming…').disable();
    setStatus('asking LM Studio…');
    try {
      const model = dreamParams.model === WHATEVER_IS_LOADED ? '' : dreamParams.model;
      const dna = await dreamCritter(dreamParams.describe, { model });
      hooks.importDNA([dna]);
      setStatus(`dreamed "${dna.name}"`);
    } catch (e) {
      const msg = (e as Error).message;
      setStatus(
        /reachable|fetch|NetworkError|Failed/i.test(msg)
          ? 'LM Studio not reachable on :1234'
          : `dream failed: ${msg.slice(0, 40)}`,
      );
      console.warn('[dream]', e);
    }
    goCtrl.name('✨ dream it').enable();
  }

  // --- selection + live DNA editor ---
  const editor = buildEditor(hooks, setStatus);
  const edit = gui.addFolder('selected critter');
  const editParams = {
    which: '(none)',
    open: () => {
      if (!selected) return setStatus('click a critter first');
      editor.open(selected);
    },
    share: () => {
      if (!selected) return setStatus('click a critter first');
      navigator.clipboard.writeText(encodeDNA(selected.dna)).then(
        () => setStatus('share link copied'),
        () => setStatus('clipboard blocked'),
      );
    },
  };
  edit.add(editParams, 'open').name('✎ edit DNA…');
  edit.add(editParams, 'share').name('🔗 copy share link');

  // Dropdown lives last in the folder: lil-gui's .options() destroys the
  // controller and appends a replacement, so anything after it would jump
  // around every time the roster changes.
  let whichCtrl = edit.add(editParams, 'which', ['(none)']).name('critter');
  function refreshDropdown(): void {
    const list = hooks.critters();
    // Names repeat (seeded critters share a naming scheme), so options are
    // keyed by roster index with the name shown alongside.
    const labels = list.map((c, i) => `${i}: ${c.dna.name}`);
    const i = selected ? list.indexOf(selected) : -1;
    editParams.which = i >= 0 ? labels[i] : '(none)';
    whichCtrl = whichCtrl
      .options(labels.length ? labels : ['(none)'])
      .name('critter')
      .onChange((label: string) => {
        hooks.onSelect(hooks.critters()[Number(label.split(':')[0])] ?? null);
      });
  }
  refreshDropdown();
  edit.onOpenClose((f) => {
    if (!f._closed) refreshDropdown();
  });

  const statsCtrl = gui.add(params, 'stats').name('perf').disable();

  return {
    setFps: (fps, calls, tris) => {
      params.stats = `${fps.toFixed(0)} fps · ${calls} calls · ${(tris / 1000).toFixed(0)}k tris`;
      statsCtrl.updateDisplay();
    },
    setSelected: (critter) => {
      selected = critter;
      refreshDropdown();
      if (critter) setStatus(`selected ${critter.dna.name}`);
      // Keep an open editor pointed at whatever is now selected.
      editor.retargetIfOpen(critter);
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
    /** Follow the selection while open, but never steal focus mid-edit. */
    retargetIfOpen(critter: Critter | null) {
      if (panel.style.display === 'none' || !critter || critter === current) return;
      if (document.activeElement === area) return;
      current = critter;
      area.value = JSON.stringify(critter.dna, null, 2);
    },
  };
}
