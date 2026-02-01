import { Outlet } from 'react-router-dom';
import { AppSidebar } from '@/components/AppSidebar';
import { AppHeader } from '@/components/AppHeader';

export function AppLayout() {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <AppHeader />
      <main className="ml-64 min-h-screen pt-16">
        <div className="p-6">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
