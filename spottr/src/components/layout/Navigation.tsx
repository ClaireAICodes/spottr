import { type FC } from 'react';
import { useAppStore, type TabKey } from '../../store/useAppStore';
import {
  Home,
  Dumbbell,
  ClipboardList,
  History,
  Settings,
  type LucideIcon,
} from 'lucide-react';

// ============================================================
// Tab Configuration (5 tabs per features-screens.md)
// ============================================================

interface TabConfig {
  key: TabKey;
  label: string;
  Icon: LucideIcon;
  /** True = Workouts tab — persistent glow per spec */
  isSpecial?: boolean;
}

const tabs: TabConfig[] = [
  { key: 'home', label: 'Home', Icon: Home },
  { key: 'library', label: 'Library', Icon: Dumbbell },
  { key: 'workouts', label: 'Workouts', Icon: ClipboardList, isSpecial: true },
  { key: 'history', label: 'History', Icon: History },
  { key: 'settings', label: 'Settings', Icon: Settings },
];

// ============================================================
// Component
// ============================================================

/**
 * Bottom navigation bar with 5 equal-width glass tabs.
 * Active = semi-transparent gradient fill + white text.
 * Workouts tab = persistent gradient border + 3s glow pulse (features-screens.md).
 */
const Navigation: FC<{ onTabChange?: (tab: TabKey) => void }> = ({
  onTabChange,
}) => {
  const activeTab = useAppStore((s) => s.activeTab);
  const setActiveTab = useAppStore((s) => s.setActiveTab);

  const handle = (tab: TabKey) => {
    setActiveTab(tab);
    onTabChange?.(tab);
  };

  return (
    <nav
      className="fixed bottom-0 left-0 right-0 z-40"
      style={{
        background: 'rgba(15, 23, 42, 0.85)',
        backdropFilter: 'blur(16px)',
        WebkitBackdropFilter: 'blur(16px)',
        borderTop: '1px solid rgba(255, 255, 255, 0.08)',
      }}
      role="tablist"
    >
      <div className="flex items-stretch justify-around max-w-lg mx-auto h-16">
        {tabs.map(({ key, label, Icon, isSpecial }) => {
          const isActive = activeTab === key;
          return (
            <button
              key={key}
              role="tab"
              aria-selected={isActive}
              aria-label={label}
              onClick={() => handle(key)}
              className={[
                'flex flex-col items-center justify-center gap-0.5 flex-1 relative cursor-pointer border-none outline-none transition-all duration-200 ease-in-out',
                isActive
                  ? 'text-white'
                  : 'text-slate-500 hover:text-slate-300',
              ].join(' ')}
              style={
                isActive
                  ? {
                      background:
                        'linear-gradient(180deg, rgba(56, 189, 248, 0.12) 0%, rgba(99, 102, 241, 0.08) 100%)',
                    }
                  : undefined
              }
            >
              {/* Active indicator dot */}
              {isActive && (
                <div
                  className="absolute top-1.5 rounded-full"
                  style={{
                    width: '4px',
                    height: '4px',
                    background: '#38bdf8',
                    boxShadow: '0 0 6px rgba(56, 189, 248, 0.6)',
                  }}
                />
              )}

              {/* Icon — Workouts gets glow */}
              <Icon
                size={22}
                strokeWidth={isActive ? 2.5 : 1.8}
                className={isSpecial && !isActive ? 'tab-workouts-glow rounded-xl p-1' : ''}
              />

              {/* Label */}
              <span className="text-[10px] font-medium tracking-wide">{label}</span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default Navigation;
