import { Icon } from '../components/Icon';

export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="kk-topbar">
      <div className="kk-topbar-inner">
        {onBack && (
          <button type="button" className="kk-icon-btn" onClick={onBack} aria-label="Back">
            <Icon name="back" />
          </button>
        )}
        <h1>{title}</h1>
      </div>
    </header>
  );
}
