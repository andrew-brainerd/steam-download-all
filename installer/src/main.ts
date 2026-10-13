import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { openUrl } from '@tauri-apps/plugin-opener';

type Detection = {
  steam_found: boolean;
  steam_path: string | null;
  steam_running: boolean;
  millennium: boolean;
  plugin: boolean;
  plugin_enabled: boolean;
  standalone: boolean;
};

type Action =
  | { kind: 'install_millennium' }
  | { kind: 'install_standalone' }
  | { kind: 'remove'; download_all: boolean; millennium: boolean };

type PlannedStep = { id: string; label: string };

type StepEvent =
  | { status: 'running'; index: number }
  | { status: 'progress'; index: number; fraction: number }
  | { status: 'done'; index: number }
  | { status: 'failed'; index: number; message: string };

const REPO_URL = 'https://github.com/andrew-brainerd/steam-download-all';
const DOWNLOADS_URL = 'steam://open/downloads';

const view = document.getElementById('view')!;
const primary = document.getElementById('primary') as HTMLButtonElement;
const secondary = document.getElementById('secondary') as HTMLButtonElement;

let onPrimary: () => void = () => {};
let onSecondary: () => void = () => {};
primary.addEventListener('click', () => onPrimary());
secondary.addEventListener('click', () => onSecondary());
document.getElementById('close')!.addEventListener('click', () => void getCurrentWindow().close());
document.getElementById('github')!.addEventListener('click', () => void openUrl(REPO_URL));

const escape = (text: string) =>
  text.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

function render(html: string) {
  view.innerHTML = `<section class="view">${html}</section>`;
}

function setButtons(options: {
  primary: string;
  enabled?: boolean;
  loading?: boolean;
  onPrimary?: () => void;
  secondary?: string;
  onSecondary?: () => void;
}) {
  primary.textContent = options.loading ? '' : options.primary;
  primary.disabled = !options.enabled || !!options.loading;
  primary.dataset.loading = String(!!options.loading);
  onPrimary = options.onPrimary ?? (() => {});
  secondary.classList.toggle('hidden', !options.secondary);
  secondary.textContent = options.secondary ?? '';
  onSecondary = options.onSecondary ?? (() => {});
}

function card(id: string, title: string, text: string, badge?: { label: string; muted?: boolean }, disabled = false) {
  const badgeHtml = badge ? `<span class="badge${badge.muted ? ' muted' : ''}">${escape(badge.label)}</span>` : '';
  return `<button class="card" type="button" data-id="${id}" aria-pressed="false"${disabled ? ' disabled' : ''}>
    <div class="card-title">${escape(title)}${badgeHtml}</div>
    <div class="card-text">${escape(text)}</div>
  </button>`;
}

function wireCards(onSelect: (id: string) => void) {
  const cards = [...view.querySelectorAll<HTMLButtonElement>('.card')];
  for (const el of cards) {
    el.addEventListener('click', () => {
      for (const other of cards) other.setAttribute('aria-pressed', String(other === el));
      onSelect(el.dataset.id!);
    });
  }
}

const steamNote = (state: Detection) =>
  state.steam_running ? `<p class="note">Steam will close while this runs and reopen when it's done.</p>` : '';

async function home() {
  setButtons({ primary: 'Next', loading: true });
  const state = await invoke<Detection>('detect');

  if (!state.steam_found) {
    render(`<h1>Steam wasn't found</h1>
      <p class="lede">Install Steam and sign in once, then run this installer again.</p>`);
    setButtons({ primary: 'Close', enabled: true, onPrimary: () => void getCurrentWindow().close() });
    return;
  }

  const anythingInstalled = state.plugin || state.standalone || state.millennium;
  const installed = (state.plugin && state.plugin_enabled) || state.standalone;
  render(`<div class="cards">
    ${card('install', installed ? 'Reinstall' : 'Install', 'Add a Download All button to Steam that starts every pending update at once.', installed ? { label: 'Installed', muted: true } : undefined)}
    ${card('remove', 'Remove', 'Uninstall Download All, and optionally Millennium.', undefined, !anythingInstalled)}
  </div>`);

  let choice = '';
  setButtons({ primary: 'Next', enabled: false });
  wireCards(id => {
    choice = id;
    setButtons({ primary: 'Next', enabled: true, onPrimary: () => (choice === 'install' ? installOptions(state) : removeOptions(state)) });
  });
}

function installOptions(state: Detection) {
  const millenniumText = state.millennium
    ? 'Millennium is already installed. Adds the Download All plugin and turns it on.'
    : 'Installs Millennium (the latest release, checksum-verified) plus the Download All plugin.';
  const standaloneText =
    'No Millennium. Runs a small background app and turns on Steam’s local debugging port, which other programs on this PC can also use.';
  render(`<h1>How should Download All run?</h1>
    <p class="lede">Both add the same button to Steam’s Downloads page.</p>
    <div class="cards">
      ${card('millennium', 'With Millennium', millenniumText, { label: state.plugin && state.plugin_enabled ? 'Installed' : 'Recommended', muted: state.plugin && state.plugin_enabled })}
      ${card('standalone', 'Standalone', standaloneText, state.standalone ? { label: 'Installed', muted: true } : undefined)}
    </div>
    ${steamNote(state)}`);

  const back = { secondary: 'Back', onSecondary: () => void home() };
  setButtons({ primary: 'Install', enabled: false, ...back });
  wireCards(id => {
    const action: Action = id === 'millennium' ? { kind: 'install_millennium' } : { kind: 'install_standalone' };
    setButtons({ primary: 'Install', enabled: true, onPrimary: () => void runAction(action, 'Installing'), ...back });
  });
}

function removeOptions(state: Detection) {
  const flavor = [state.plugin && 'Millennium plugin', state.standalone && 'standalone app'].filter(Boolean).join(' and ');
  const items = [
    (state.plugin || state.standalone) &&
      `<label class="check"><input type="checkbox" name="download_all" checked />
        <span><div class="check-title">Download All</div><div class="check-text">Removes the ${escape(flavor)}${state.standalone ? ' and turns Steam’s debugging port back off' : ''}.</div></span></label>`,
    state.millennium &&
      `<label class="check"><input type="checkbox" name="millennium" />
        <span><div class="check-title">Millennium</div><div class="check-text">Removes Millennium’s program files. Your Millennium settings, themes and other plugins are kept.</div></span></label>`
  ].filter(Boolean);

  render(`<h1>What should be removed?</h1>
    <p class="lede">Only the parts you select are removed.</p>
    <div class="checks">${items.join('')}</div>
    ${steamNote(state)}`);

  const update = () => {
    const download_all = !!view.querySelector<HTMLInputElement>('input[name="download_all"]')?.checked;
    const millennium = !!view.querySelector<HTMLInputElement>('input[name="millennium"]')?.checked;
    setButtons({
      primary: 'Remove',
      enabled: download_all || millennium,
      onPrimary: () => void runAction({ kind: 'remove', download_all, millennium }, 'Removing'),
      secondary: 'Back',
      onSecondary: () => void home()
    });
  };
  view.querySelectorAll('input').forEach(input => input.addEventListener('change', update));
  update();
}

const icons = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>',
  cross: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17" /></svg>'
};

async function runAction(action: Action, verb: string) {
  setButtons({ primary: verb, loading: true });
  let steps: PlannedStep[];
  try {
    steps = await invoke<PlannedStep[]>('plan', { action });
  } catch (error) {
    return failed(String(error));
  }

  render(`<h1>${verb}…</h1>
    <p class="lede">This only takes a moment. Keep this window open.</p>
    <div class="progress"><div class="progress-fill"></div></div>
    <ol class="steps">${steps
      .map(
        (s, i) =>
          `<li class="step" data-index="${i}" data-status="pending"><span class="step-icon"><span class="dot"></span></span>${escape(s.label)}<span class="step-detail"></span></li>`
      )
      .join('')}</ol>`);

  const fill = view.querySelector<HTMLDivElement>('.progress-fill')!;
  const fractions = steps.map(() => 0);
  const setFraction = (index: number, fraction: number) => {
    fractions[index] = fraction;
    fill.style.width = `${(fractions.reduce((a, b) => a + b, 0) / steps.length) * 100}%`;
  };
  const stepEl = (index: number) => view.querySelector<HTMLLIElement>(`.step[data-index="${index}"]`)!;

  const unlisten = await listen<StepEvent>('step', ({ payload }) => {
    const el = stepEl(payload.index);
    const icon = el.querySelector('.step-icon')!;
    const detail = el.querySelector('.step-detail')!;
    if (payload.status === 'running') {
      el.dataset.status = 'running';
      icon.innerHTML = '<span class="spinner"></span>';
      setFraction(payload.index, 0.15);
    } else if (payload.status === 'progress') {
      detail.textContent = `${Math.round(payload.fraction * 100)}%`;
      setFraction(payload.index, Math.max(0.15, payload.fraction));
    } else if (payload.status === 'done') {
      el.dataset.status = 'done';
      icon.innerHTML = icons.check;
      detail.textContent = '';
      setFraction(payload.index, 1);
    } else {
      el.dataset.status = 'failed';
      icon.innerHTML = icons.cross;
    }
  });

  try {
    await invoke('execute', { action });
    unlisten();
    setTimeout(() => succeeded(action), 450);
  } catch (error) {
    unlisten();
    setTimeout(() => failed(String(error)), 450);
  }
}

function succeeded(action: Action) {
  const removing = action.kind === 'remove';
  render(`<div class="result-icon ok">${icons.check}</div>
    <h1>${removing ? 'Removed' : 'Download All is ready'}</h1>
    <p class="lede">${
      removing
        ? 'Steam is reopening without the parts you removed.'
        : 'Steam is reopening. Open its Downloads page to find the Download All button in the header.'
    }</p>`);
  view.querySelector('.view')!.classList.add('result');
  setButtons({
    primary: 'Finish',
    enabled: true,
    onPrimary: () => void getCurrentWindow().close(),
    ...(removing ? {} : { secondary: 'Open Downloads', onSecondary: () => void openUrl(DOWNLOADS_URL) })
  });
}

function failed(message: string) {
  render(`<div class="result-icon fail">${icons.cross}</div>
    <h1>Something went wrong</h1>
    <p class="lede">${escape(message)}</p>
    <p class="lede">Nothing else was changed after this step. You can try again, or <button class="link" type="button" id="report">report the problem</button>.</p>`);
  view.querySelector('.view')!.classList.add('result');
  view.querySelector('#report')!.addEventListener('click', () => void openUrl(`${REPO_URL}/issues`));
  setButtons({ primary: 'Try again', enabled: true, onPrimary: () => void home(), secondary: 'Close', onSecondary: () => void getCurrentWindow().close() });
}

void home();
