import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';
import { useIsMobile } from '@/hooks/use-mobile';
import { ChatWidget } from '@/components/chat/ChatWidget';

export function AppLayout() {
  const isMobile = useIsMobile();

  return (
    <div className="min-h-screen bg-background">
      {/* Desktop sidebar - hidden on mobile */}
      {!isMobile && <AppSidebar />}
      
      <AppHeader />
      
      <main className={`min-h-screen pt-16 ${!isMobile ? 'ml-64' : ''}`}>
        <div className="p-4 md:p-6">
          <Outlet />
        </div>
      </main>

      <ChatWidget />
    </div>
  );
}
