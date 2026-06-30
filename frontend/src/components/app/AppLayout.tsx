import { ReactNode } from 'react';
import { DynamicSidebar } from './DynamicSidebar';
import { Bell } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

interface AppLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}

export function AppLayout({ children, title, subtitle, actions }: AppLayoutProps) {
  return (
    <div className="min-h-screen bg-background flex">
      <DynamicSidebar />
      <div className="flex-1 flex flex-col ml-[180px] max-md:ml-[60px] min-h-screen">
        <header className="h-16 border-b border-border flex items-center justify-between px-6 bg-card/50 backdrop-blur-sm sticky top-0 z-40">
          <div>
            <h1 className="text-xl font-semibold">{title}</h1>
            {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="flex items-center gap-4">
            {actions}
            <Link to="/app/alerts">
              <Button variant="ghost" size="sm">
                <Bell className="w-4 h-4 mr-2" />
                Alerts
              </Button>
            </Link>
          </div>
        </header>
        <main className="flex-1 p-6 overflow-auto">{children}</main>
      </div>
    </div>
  );
}
