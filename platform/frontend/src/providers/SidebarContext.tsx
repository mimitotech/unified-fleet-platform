import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from 'react';

interface SidebarContextValue {
  collapsed: boolean;
  /** Phone + tablet: overlay drawer instead of pushing content. */
  isCompact: boolean;
  /** Desktop rail width; 0 on compact so content is full-width. */
  width: number;
  mobileOpen: boolean;
  setCollapsed: (v: boolean) => void;
  setMobileOpen: (v: boolean) => void;
  toggle: () => void;
}

const SidebarContext = createContext<SidebarContextValue | null>(null);

/** Below lg (1024px) = phone + tablet overlay nav. */
const COMPACT_MQ = '(max-width: 1023px)';

export function SidebarProvider({ children }: { children: ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [isCompact, setIsCompact] = useState(() =>
    typeof window !== 'undefined' ? window.matchMedia(COMPACT_MQ).matches : false,
  );
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia(COMPACT_MQ);
    const apply = () => {
      const compact = mq.matches;
      setIsCompact(compact);
      if (compact) {
        setCollapsed(true);
        setMobileOpen(false);
      }
    };
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const toggle = useCallback(() => {
    if (isCompact) {
      setMobileOpen((o) => !o);
      return;
    }
    setCollapsed((c) => !c);
  }, [isCompact]);

  const width = isCompact ? 0 : collapsed ? 84 : 232;

  return (
    <SidebarContext.Provider
      value={{
        collapsed: isCompact ? true : collapsed,
        isCompact,
        width,
        mobileOpen,
        setCollapsed,
        setMobileOpen,
        toggle,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

export function useSidebar() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error('useSidebar must be used within SidebarProvider');
  return ctx;
}
