/**
 * The subject title's long press (`SubjectInfoButtonView`): an action mode bar above the toolbar
 * (the framework's primary ActionMode: #303030 with the 2 dp `colorControlActivated` line, Done at
 * the left, the content pushed down 56 dp) with "Copy title" and the configured search engines
 * (`search_engine_1..5`); the items that don't fit go into its overflow menu
 * (`ActionMenuPresenter`: 2 / 3 / 4 / 5 buttons by screen width, one slot kept for the overflow).
 * Copy → "Subject title copied"; a search engine opens its URL in the browser. An image-only radical
 * gets Java's toast instead. Done, Back or an action closes it.
 */
import { useEffect, useRef, useState, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { createPortal } from 'react-dom';
import type { ContentSubject } from '../../../core/content';
import type { Preferences } from '../../../core/settings';
import { useBackHandler } from '../../hooks/useRoute';
import { toast } from '../../shell/toast';
import { Icon } from '../Icon';
import { searchEngines, searchUrl } from './searchEngines';
import './actionMode.css';

interface ActionModeState { owner: object; characters: string; prefs: Preferences }

let active: ActionModeState | null = null;
const listeners = new Set<() => void>();
const emit = () => { for (const l of listeners) l(); };

export function startTitleActionMode(owner: object, subject: ContentSubject, characters: string | null, prefs: Preferences): boolean {
  if (active !== null) return false;
  const text = characters ?? subject.characters;
  if (text === null || text === '') {
    toast("This radical has no text character. Can't copy or search for an image-only radical.", { long: true });
    return false;
  }
  active = { owner, characters: text, prefs };
  document.documentElement.classList.add('kk-action-mode');
  emit();
  return true;
}

export function finishTitleActionMode(): void {
  if (active === null) return;
  active = null;
  document.documentElement.classList.remove('kk-action-mode');
  emit();
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** `ActionMenuPresenter.getMaxActionButtons` (by the width in dp). */
function maxActionButtons(width: number): number {
  if (width >= 600) return 5;
  if (width >= 500) return 4;
  if (width >= 360) return 3;
  return 2;
}

/** ClipboardManager.setPrimaryClip: the async clipboard, else the selection copy command. */
async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch { ok = false; }
    ta.remove();
    return ok;
  }
}

function openUrl(url: string): void {
  // An anchor click: the Android WebView hands http(s) links to the browser (Capacitor), a browser opens a tab.
  const a = document.createElement('a');
  a.href = url;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

function ActionModeBar({ state }: { state: ActionModeState }) {
  const [menuOpen, setMenuOpen] = useState(false);
  useBackHandler(() => { finishTitleActionMode(); return true; });
  const items = [
    {
      id: 'copy', label: 'Copy title', run: () => {
        void copyText(state.characters).then((ok) => { if (ok) toast('Subject title copied'); });
      },
    },
    ...searchEngines(state.prefs).map((e) => ({ id: `search-${e.index}`, label: e.name, run: () => openUrl(searchUrl(e, state.characters)) })),
  ];
  const max = maxActionButtons(typeof window === 'undefined' ? 411 : window.innerWidth);
  // Measured on Java (411 dp, 3 slots): Copy title + 2 engines → 2 buttons and the overflow.
  const shown = items.length >= max ? items.slice(0, max - 1) : items;
  const overflow = items.slice(shown.length);
  const pick = (run: () => void) => { setMenuOpen(false); run(); finishTitleActionMode(); };
  return (
    <div className="kk-action-mode-bar" data-testid="title-action-mode">
      <div className="kk-action-mode-inner">
        <button type="button" className="kk-toolbar-btn" aria-label="Done" data-testid="action-mode-done" onClick={finishTitleActionMode}>
          <Icon name="arrowBack" />
        </button>
        <span className="kk-action-mode-space" />
        {shown.map((i) => (
          <button key={i.id} type="button" className="kk-action-mode-item" data-testid={`action-${i.id}`} onClick={() => pick(i.run)}>{i.label}</button>
        ))}
        {overflow.length > 0 && (
          <div className="kk-toolbar-overflow">
            <button type="button" className="kk-toolbar-btn" aria-label="More options" aria-haspopup="menu" aria-expanded={menuOpen}
              data-testid="action-mode-overflow" onClick={() => setMenuOpen((o) => !o)}>
              <Icon name="more" />
            </button>
            {menuOpen && (
              <ul className="kk-toolbar-menu" role="menu">
                {overflow.map((i) => (
                  <li key={i.id} role="none">
                    <button type="button" role="menuitem" data-testid={`action-${i.id}`} onClick={() => pick(i.run)}><span>{i.label}</span></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** The action mode bar while `owner`'s action mode is active (closed when the owner unmounts). */
function TitleActionModeHost({ owner }: { owner: object }) {
  const state = useSyncExternalStore(subscribe, () => active, () => null);
  useEffect(() => () => { if (active?.owner === owner) finishTitleActionMode(); }, [owner]);
  if (state === null || state.owner !== owner || typeof document === 'undefined') return null;
  return createPortal(<ActionModeBar state={state} />, document.body);
}

/**
 * The WebView starts a text selection at the long-pressed point once the bar has pushed the page
 * down (Java's long click consumes the press): no selection until the finger lifts.
 */
function blockSelectionUntilRelease(): void {
  if (typeof document === 'undefined') return;
  const block = (e: Event) => e.preventDefault();
  const release = () => {
    setTimeout(() => document.removeEventListener('selectstart', block, true), 0);
    for (const t of ['touchend', 'touchcancel', 'pointerup', 'mouseup']) document.removeEventListener(t, release, true);
  };
  document.addEventListener('selectstart', block, true);
  for (const t of ['touchend', 'touchcancel', 'pointerup', 'mouseup']) document.addEventListener(t, release, true);
}

/** Android's long-press timeout (`ViewConfiguration.getLongPressTimeout`). */
const LONG_PRESS_MS = 400;

/**
 * Long-press handlers for a subject title (`setOnLongClickListener`): spread `handlers` on it;
 * `consumeLongPress()` in its click handler swallows the click after a long press. Render `node`
 * next to the title: it is the bar while this title's action mode is open.
 */
export function useTitleLongPress(subject: ContentSubject, characters: string | null, prefs: Preferences) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const fired = useRef(false);
  const [owner] = useState(() => ({}));
  const cancel = () => { if (timer.current !== null) clearTimeout(timer.current); timer.current = null; start.current = null; };
  useEffect(() => cancel, []);
  return {
    node: <TitleActionModeHost owner={owner} />,
    /** True once when the press that just ended was a long press (swallow its click). */
    consumeLongPress(): boolean {
      const f = fired.current;
      fired.current = false;
      return f;
    },
    handlers: {
      onPointerDown(e: ReactPointerEvent) {
        if (e.button !== 0) return;
        fired.current = false;
        blockSelectionUntilRelease();
        start.current = { x: e.clientX, y: e.clientY };
        if (timer.current !== null) clearTimeout(timer.current);
        timer.current = setTimeout(() => {
          timer.current = null;
          fired.current = true;
          startTitleActionMode(owner, subject, characters, prefs);
        }, LONG_PRESS_MS);
      },
      onPointerMove(e: ReactPointerEvent) {
        const s = start.current;
        // Touch slop 8 dp.
        if (s !== null && Math.hypot(e.clientX - s.x, e.clientY - s.y) > 8) cancel();
      },
      onPointerUp: cancel,
      onPointerCancel: cancel,
      onPointerLeave: cancel,
      onContextMenu(e: { preventDefault(): void }) {
        // The browser's own long-press menu (and desktop right-click) opens the action mode instead.
        e.preventDefault();
        if (!fired.current) { cancel(); fired.current = true; startTitleActionMode(owner, subject, characters, prefs); }
      },
    },
  };
}
