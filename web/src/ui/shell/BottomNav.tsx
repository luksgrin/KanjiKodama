import { Icon, type IconName } from '../components/Icon';
import { paths, type RouteName } from '../routes';

const TABS: readonly { route: RouteName; href: string; label: string; icon: IconName }[] = [
  { route: 'dashboard', href: paths.dashboard(), label: 'Home', icon: 'home' },
  { route: 'browse', href: paths.browse(), label: 'Browse', icon: 'browse' },
  { route: 'selfStudy', href: paths.selfStudy(), label: 'Study', icon: 'study' },
  { route: 'settings', href: paths.settings(), label: 'Settings', icon: 'settings' },
];

/** Bottom tab bar (phones; safe-area padded). Tabs replace the history entry instead of stacking. */
export function BottomNav({ current, onNavigate }: { current: RouteName; onNavigate(path: string): void }) {
  return (
    <nav className="kk-bottomnav" aria-label="Main">
      <ul>
        {TABS.map((t) => (
          <li key={t.route}>
            <a href={`#${t.href}`} aria-current={current === t.route ? 'page' : undefined}
              onClick={(e) => { e.preventDefault(); onNavigate(t.href); }}>
              <Icon name={t.icon} />
              <span>{t.label}</span>
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
