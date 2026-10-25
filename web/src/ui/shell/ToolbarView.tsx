/**
 * Renders the toolbar configured with `useToolbar` (toolbar.tsx): Java's androidx Toolbar with the
 * WKToolbarTheme (Silkscreen title, 56dp high, elevation 4dp), the up arrow, the "ifRoom" action
 * icons, the collapsible SearchView and the overflow popup (ThemeOverlay.AppCompat.Dark).
 */
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { handleBack } from '../../app/back';
import { Icon, type IconName } from '../components/Icon';
import { useApp, useAppState } from '../hooks/useApp';
import { useLocation, useNavigate, useRoute } from '../hooks/useRoute';
import { paths, ROUTE_BY_NAME } from '../routes';
import { isMuted, MUTE_PREF } from '../../app/mute';
import { useToolbarOptions, type ToolbarAction, type ToolbarColor } from './toolbar';

/** Java menu ids (without `action_`) in res/menu order; screen actions with these ids go there. */
const MENU_ORDER = [
  'settings', 'search', 'dashboard', 'mute', 'download_audio', 'browse', 'fast_travel', 'level_test',
  'search_result_refine', 'search_result_save_preset', 'search_result_self_study', 'search_result_resurrect',
  'search_result_burn', 'search_result_star0', 'search_result_star1', 'search_result_star2',
  'search_result_star3', 'search_result_star4', 'search_result_star5',
  'session_log', 'view_last_finished', 'back_to_presentation', 'abandon_session', 'wrapup_session',
  'study_materials', 'self_study', 'sync_now', 'sync_subject', 'flush_tasks', '*', 'about', 'support',
];

function orderOf(id: string): number {
  const i = MENU_ORDER.indexOf(id);
  return i >= 0 ? i : MENU_ORDER.indexOf('*');
}

export function toolbarColorStyle(color: ToolbarColor | undefined): CSSProperties | undefined {
  if (color === undefined || color === 'default') return undefined;
  if (typeof color === 'object') return { '--tb-bg': color.bg, '--tb-fg': color.fg } as CSSProperties;
  const v = color === 'radical' ? 'radical' : color === 'kanji' ? 'kanji' : 'vocab';
  // ActiveTheme subject background colours; the title and icons stay white (WKToolbarTheme).
  return { '--tb-bg': `var(--color-${v})` } as CSSProperties;
}

/**
 * androidx ActionBarPolicy.getMaxActionButtons: how many toolbar slots (the overflow button takes
 * one) by screen width in dp. "ifRoom" items beyond that go to the overflow menu at their position.
 */
export function maxActionButtons(widthDp: number): number {
  if (widthDp >= 600) return 5;
  if (widthDp >= 500) return 4;
  if (widthDp >= 360) return 3;
  return 2;
}

function useViewportWidth(): number {
  const [w, setW] = useState(() => (typeof window === 'undefined' ? 411 : window.innerWidth));
  useEffect(() => {
    const on = () => setW(window.innerWidth);
    window.addEventListener('resize', on);
    return () => window.removeEventListener('resize', on);
  }, []);
  return w;
}

const ICONS: Record<string, IconName> = { search: 'search', dashboard: 'homeFilled', mute: 'volume', unmute: 'volumeOff' };

export function ToolbarView() {
  const opts = useToolbarOptions();
  const route = useRoute();
  const navigate = useNavigate();
  const location = useLocation();
  const app = useApp();
  const state = useAppState();
  const [menuOpen, setMenuOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState('');
  const menuRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const isMain = route.name === 'dashboard';
  const muted = isMuted(state.prefs);

  // Content changes collapse the search box (Java collapseSearchBox) and close the menu.
  useEffect(() => {
    setSearchOpen(false);
    setMenuOpen(false);
  }, [route.path]);

  const items = useMemo(() => {
    const go = (p: string) => () => navigate(p);
    const builtins: ToolbarAction[] = [
      { id: 'settings', label: 'Settings', onSelect: go(paths.settings()) },
      { id: 'search', label: 'Search', icon: 'search', showAsAction: true, onSelect: () => {
        setQuery(opts.searchPrefill ?? '');
        setSearchOpen(true);
      } },
      ...(isMain ? [] : [{ id: 'dashboard', label: 'Dashboard', icon: 'dashboard', showAsAction: true, onSelect: () => location.home() }]),
      { id: 'mute', label: muted ? 'Unmute' : 'Mute', icon: muted ? 'unmute' : 'mute', showAsAction: true,
        onSelect: () => void app.setPreference(MUTE_PREF, !muted) },
      { id: 'download_audio', label: 'Download audio', onSelect: go(paths.audio()) },
      { id: 'browse', label: 'Browse/search...', onSelect: go(paths.browse()) },
      ...(isMain ? [
        { id: 'fast_travel', label: 'Fast travel...', onSelect: go(paths.fastTravel()) },
        { id: 'level_test', label: 'Kanji level test...', onSelect: go(paths.levelTest()) },
      ] : []),
      { id: 'self_study', label: 'Self-study quiz', onSelect: go(paths.selfStudy()) },
      ...(state.mode === 'server' ? [{ id: 'sync_now', label: 'Sync now', onSelect: () => void app.syncNow({ manual: true }) }] : []),
      { id: 'about', label: 'About...', onSelect: go(paths.about()) },
    ];
    const merged = builtins.slice();
    for (const a of opts.actions ?? []) {
      const i = merged.findIndex((x) => x.id === a.id);
      if (i >= 0) merged[i] = { ...merged[i]!, ...a };
      else merged.push(a);
    }
    return merged
      .filter((a) => !a.hidden)
      .map((a, i) => ({ a, i }))
      .sort((x, y) => orderOf(x.a.id) - orderOf(y.a.id) || x.i - y.i)
      .map((x) => x.a);
  }, [opts.actions, opts.searchPrefill, isMain, muted, state.mode, app, navigate, location]);

  const width = useViewportWidth();
  const { icons, overflow } = useMemo(() => {
    const wanted = items.filter((a) => a.showAsAction);
    const hasOverflow = wanted.length < items.length;
    let slots = maxActionButtons(width) - (hasOverflow ? 1 : 0);
    if (!hasOverflow && wanted.length > slots) slots -= 1; // the overflow button appears after all
    const shown = new Set(wanted.slice(0, Math.max(0, slots)));
    return { icons: items.filter((a) => shown.has(a)), overflow: items.filter((a) => !shown.has(a)) };
  }, [items, width]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('pointerdown', onDown, true);
    return () => document.removeEventListener('pointerdown', onDown, true);
  }, [menuOpen]);

  useEffect(() => {
    if (searchOpen) searchRef.current?.focus();
  }, [searchOpen]);

  const back = opts.back ?? !isMain;
  const onBack = typeof back === 'function'
    ? back
    : back ? () => { handleBack(() => { navigate.back(); return true; }); } : undefined;
  const title = opts.title ?? ROUTE_BY_NAME[route.name].title;

  const submitSearch = () => {
    const q = query.trim();
    if (q === '') return;
    setSearchOpen(false);
    navigate(paths.searchResults(1, q));
  };

  return (
    <header className="kk-toolbar" style={toolbarColorStyle(opts.color)} data-testid="toolbar">
      <div className="kk-toolbar-inner">
        {searchOpen ? (
          <>
            <button type="button" className="kk-toolbar-btn" aria-label="Collapse" onClick={() => setSearchOpen(false)}>
              <Icon name="arrowBack" />
            </button>
            <form className="kk-toolbar-search" role="search" onSubmit={(e) => { e.preventDefault(); submitSearch(); }}>
              <input ref={searchRef} type="search" enterKeyHint="search" value={query} aria-label="Search"
                placeholder="Search all radicals, kanji and vocabulary" data-testid="toolbar-search-input"
                autoCapitalize="none" autoCorrect="off" spellCheck={false}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); setSearchOpen(false); } }} />
              {query !== '' && (
                <button type="button" className="kk-toolbar-btn" aria-label="Clear query" onClick={() => { setQuery(''); searchRef.current?.focus(); }}>
                  <Icon name="closeFilled" />
                </button>
              )}
            </form>
          </>
        ) : (
          <>
            {onBack && (
              <button type="button" className="kk-toolbar-btn" onClick={onBack} aria-label="Navigate up" data-testid="toolbar-back">
                <Icon name="arrowBack" />
              </button>
            )}
            <div className={`kk-toolbar-title${onBack ? '' : ' no-back'}`}>
              <h1>{title}</h1>
              {opts.subtitle !== undefined && <p className="kk-toolbar-subtitle">{opts.subtitle}</p>}
            </div>
            {icons.map((a) => (
              <button key={a.id} type="button" className="kk-toolbar-btn" aria-label={a.label} title={a.label}
                data-testid={`toolbar-${a.id}`} disabled={a.disabled} aria-pressed={a.checked}
                onClick={() => a.onSelect()}>
                <Icon name={ICONS[a.icon ?? a.id] ?? (a.icon as IconName | undefined) ?? 'more'} />
              </button>
            ))}
          </>
        )}
        {overflow.length > 0 && !searchOpen && (
          <div className="kk-toolbar-overflow" ref={menuRef}>
            <button type="button" className="kk-toolbar-btn" aria-label="More options" aria-haspopup="menu"
              aria-expanded={menuOpen} data-testid="toolbar-overflow" onClick={() => setMenuOpen((o) => !o)}>
              <Icon name="more" />
            </button>
            {menuOpen && (
              <ul className="kk-toolbar-menu" role="menu" data-testid="toolbar-menu">
                {overflow.map((a) => (
                  <li key={a.id} role="none">
                    <button type="button" role={a.checked === undefined ? 'menuitem' : 'menuitemcheckbox'}
                      aria-checked={a.checked} disabled={a.disabled} data-testid={`menu-${a.id}`}
                      onClick={() => { setMenuOpen(false); a.onSelect(); }}>
                      <span>{a.label}</span>
                      {a.checked !== undefined && <span className={`kk-menu-check${a.checked ? ' on' : ''}`} aria-hidden="true" />}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
