import React, { useState, useEffect, useCallback, createContext, useContext } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext';
import { DocumentProvider } from './context/DocumentContext';
import { NotificationProvider, useNotifications } from './context/NotificationContext';
import { ThemeProvider } from './context/ThemeContext';
import { LanguageProvider } from './context/LanguageContext';
import { LogoProvider } from './context/LogoContext';
import { LoginPage } from './pages/LoginPage';
import { AdminDashboard } from './pages/AdminDashboard';
import AdminDeleteRequests from './pages/AdminDeleteRequests';
import { ManagerDashboard } from './pages/ManagerDashboard';
import { StaffDashboard } from './pages/StaffDashboard';
import { DocumentsPage } from './pages/DocumentsPage';
import { ScannerDashboard } from './pages/ScannerDashboard';
import { UserManagement } from './pages/UserManagement';
import { FolderManagement } from './pages/FolderManagement';
import { StaffFolderDashboard } from './pages/StaffFolderDashboard';
import { ArchivePage } from './pages/ArchivePage';
import { TrashPage } from './pages/TrashPage';
import { ActivityLog } from './pages/ActivityLog';
import { ProfilePage } from './pages/ProfilePage';
import { SettingsPage } from './pages/SettingsPage';
import { Sidebar } from './components/Sidebar';
import { Header } from './components/Header';
import { ActivityLogExportPopup } from './components/ActivityLogExportPopup';
import { apiUrl } from './utils/api';
export type PageName =
  'dashboard' |
  'documents' |
  'scanner' |
  'users' |
  'folders' |
  'departments' |
  'archive' |
  'trash' |
  'activity-log' |
  'approvals' |
  'admin-delete-requests' |
  'profile' |
  'settings';
interface NavigationContextType {
  currentPage: PageName;
  navigate: (page: PageName) => void;
  selectedFolderId?: string | null;
  selectFolder?: (id: string | null) => void;
}
export const NavigationContext = createContext<NavigationContextType>({
  currentPage: 'dashboard',
  navigate: () => {throw new Error('navigate function must be used inside NavigationProvider');},
  selectedFolderId: null,
  selectFolder: () => {throw new Error('selectFolder must be used inside NavigationProvider');}
});
export function useNavigation() {
  return useContext(NavigationContext);
}
function AppContent() {
  const { user } = useAuth();
  const { createNotification, deleteNotificationsByType } = useNotifications();
  const [currentPage, setCurrentPage] = useState<PageName>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null>(null);
  const [logCount, setLogCount] = useState(0);
  const [showExportPopup, setShowExportPopup] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const navigate = (page: PageName) => setCurrentPage(page);
  const selectFolder = (id: string | null) => setSelectedFolderId(id);

  const checkLogCount = useCallback(async () => {
    try {
      const token = localStorage.getItem('dms_token');
      if (!token) return;
      const res = await fetch(apiUrl('/activity-logs/count'), {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return;
      const data = await res.json();
      setLogCount(data.count);
      // Only show popup for admin and manager users, not staff
      if (data.count >= 100 && !dismissed && user && (user.role === 'admin' || user.role === 'manager')) {
        setShowExportPopup(true);
      }
    } catch {
      // silently ignore polling errors
    }
  }, [dismissed, user]);

  useEffect(() => {
    if (!user) return;
    checkLogCount();
    const interval = setInterval(checkLogCount, 30000);
    return () => clearInterval(interval);
  }, [user, checkLogCount]);
  if (!user) {
    return <LoginPage />;
  }
  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard':
        if (user.role === 'admin') return <AdminDashboard />;
        if (user.role === 'manager') return <ManagerDashboard />;
        return <StaffDashboard />;
      case 'approvals':
        return <ManagerDashboard />;
      case 'documents':
        return <DocumentsPage />;
      case 'scanner':
        return <ScannerDashboard />;
      case 'users':
        return user.role === 'admin' ? <UserManagement /> : <StaffDashboard />;
      case 'folders':
        return user.role === 'admin' ? <FolderManagement /> : <StaffFolderDashboard />;
      case 'archive':
        return <ArchivePage />;
      case 'trash':
        return <TrashPage />;
      case 'activity-log':
        return user.role === 'admin' ? <ActivityLog /> : <StaffDashboard />;
      case 'admin-delete-requests':
        return (user.role === 'admin' || user.role === 'manager') ? <AdminDeleteRequests /> : <StaffDashboard />;
      case 'profile':
        return <ProfilePage />;
      case 'settings':
        return <SettingsPage />;
      default:
        if (user.role === 'admin') return <AdminDashboard />;
        if (user.role === 'manager') return <ManagerDashboard />;
        return <StaffDashboard />;
    }
  };
  return (
    <NavigationContext.Provider
      value={{
        currentPage,
        navigate,
        selectedFolderId,
        selectFolder
      }}>

      <div
        className="flex h-screen overflow-hidden bg-[#EEEEEE] dark:bg-[#121212]">

        <Sidebar
          isOpen={sidebarOpen}
          onToggle={() => setSidebarOpen(!sidebarOpen)} />

        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <Header
            onMenuToggle={() => setSidebarOpen(!sidebarOpen)}
            currentPage={currentPage} />

          <main className="flex-1 overflow-y-auto p-6 dark:bg-[#121212]">{renderPage()}</main>
        </div>
      </div>
      {showExportPopup && (
        <ActivityLogExportPopup
          count={logCount}
          onDismiss={() => {
            setShowExportPopup(false);
            setDismissed(true);
            if (user) {
              createNotification({
                userId: user.id,
                type: 'activity-log-export',
                title: 'Activity Log Export Required',
                message: `Activity logs reached ${logCount} records. Please download the report from the Activity Log page.`,
              });
            }
          }}
          onExported={async () => {
            setShowExportPopup(false);
            setDismissed(false);
            setLogCount(0);
            // Delete any activity-log-export notifications
            await deleteNotificationsByType('activity-log-export');
            checkLogCount();
          }}
        />
      )}
    </NavigationContext.Provider>);

}
export function App() {
  return (
    <LanguageProvider>
      <LogoProvider>
        <ThemeProvider>
          <AuthProvider>
            <DocumentProvider>
              <NotificationProvider>
                <AppContent />
              </NotificationProvider>
            </DocumentProvider>
          </AuthProvider>
        </ThemeProvider>
      </LogoProvider>
    </LanguageProvider>);

}