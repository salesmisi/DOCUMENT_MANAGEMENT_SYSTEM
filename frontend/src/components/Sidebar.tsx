import React, { useState } from 'react';
import {
  LayoutDashboard,
  FileText,
  Scan,
  Users,
  FolderOpen,
  Archive,
  Trash2,
  Activity,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Building2,
  Menu,
  X,
  LogOut,
  Shield } from
'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation, PageName } from '../App';
import { useDocuments } from '../context/DocumentContext';
import { useLanguage } from '../context/LanguageContext';
import { useLogo, LOGO_SIZES } from '../context/LogoContext';
import { assetUrl } from '../utils/api';
interface SidebarProps {
  isOpen: boolean;
  onToggle: () => void;
}
interface NavItem {
  id: PageName;
  label: string;
  icon: React.ReactNode;
  roles: string[];
  badge?: number;
  children?: {
    id: PageName;
    label: string;
  }[];
}
export function Sidebar({ isOpen, onToggle }: SidebarProps) {
  const { user, logout } = useAuth();
  const { currentPage, navigate } = useNavigation();
  const { documents } = useDocuments();
  const { t } = useLanguage();
  const { logo, logoSize } = useLogo();
  const [expandedItems, setExpandedItems] = useState<string[]>(['documents']);
  const pendingCount = documents.filter((d) => d.status === 'pending').length;
  const navItems: NavItem[] = [
  {
    id: 'dashboard',
    label: t('dashboard'),
    icon: <LayoutDashboard size={18} />,
    roles: ['admin', 'manager', 'staff']
  },
  ...(user?.role === 'manager' ?
  [
  {
    id: 'approvals' as PageName,
    label: t('pendingApprovals'),
    icon: <CheckSquare size={18} />,
    roles: ['manager'],
    badge: pendingCount
  }] :

  []),
  {
    id: 'documents',
    label: t('documents'),
    icon: <FileText size={18} />,
    roles: ['admin', 'manager', 'staff']
  },
  {
    id: 'scanner',
    label: t('scannerDashboard'),
    icon: <Scan size={18} />,
    roles: ['admin', 'manager', 'staff']
  },
  ...(user?.role === 'admin' ?
  [
    {
      id: 'users' as PageName,
      label: t('userManagement'),
      icon: <Users size={18} />,
      roles: ['admin']
    },
    {
      id: 'admin-delete-requests' as PageName,
      label: t('deleteRequests'),
      icon: <Trash2 size={18} />,
      roles: ['admin']
    }
  ] :
  []),
  ...(user?.role === 'manager' ?
  [
    {
      id: 'admin-delete-requests' as PageName,
      label: t('deleteRequests'),
      icon: <Trash2 size={18} />,
      roles: ['manager']
    }
  ] :
  []),
  {
    id: 'archive',
    label: t('archives'),
    icon: <Archive size={18} />,
    roles: ['admin', 'manager', 'staff']
  },
  {
    id: 'trash',
    label: t('trash'),
    icon: <Trash2 size={18} />,
    roles: ['admin', 'manager', 'staff']
  },
  ...(user?.role === 'admin' ?
  [
  {
    id: 'activity-log' as PageName,
    label: t('activityLog'),
    icon: <Activity size={18} />,
    roles: ['admin']
  }] :

  [])];

  const visibleItems = navItems.filter((item) =>
  item.roles.includes(user?.role || '')
  );
  const roleColors: Record<string, string> = {
    admin: '#C0B87A',
    manager: '#427A43',
    staff: '#F2E3BB'
  };
  const roleLabels: Record<string, string> = {
    admin: t('administrator'),
    manager: t('departmentManager'),
    staff: t('staff')
  };
  return (
    <>
      {/* Mobile overlay */}
      {isOpen &&
      <div
        className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
        onClick={onToggle} />

      }

      {/* Sidebar */}
      <div
        className={`
          fixed lg:relative z-30 lg:z-auto
          flex flex-col h-full
          transition-all duration-300 ease-in-out
          ${isOpen ? 'w-64 translate-x-0' : 'w-0 lg:w-16 -translate-x-full lg:translate-x-0'}
          overflow-hidden
        `}
        style={{
          backgroundColor: '#001524'
        }}>

      {/* Logo / Brand */}
       <div className="flex items-center justify-center p-6 border-b border-[#0f3d0f]">
        {isOpen ? (
          <button
            onClick={() => navigate('dashboard')}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            title="Go to Dashboard"
          >
            <img
              src={logo}
              alt="Logo"
              className={`${LOGO_SIZES[logoSize].width} h-auto object-contain`}/>
          </button>
        ) : (
          <button
            onClick={() => navigate('dashboard')}
            className="cursor-pointer hover:opacity-80 transition-opacity"
            title="Go to Dashboard"
          >
            <img
              src={logo}
              alt="Logo"
              className="w-7 h-7 object-contain"/>
          </button>
        )}
    </div>
        {/* User Info */}
        {isOpen && user &&
        <button
            onClick={() => navigate('profile')}
            className="w-full px-4 py-3 border-b border-[#cad4ca] hover:bg-[#0a2535] transition-colors cursor-pointer text-left"
            title="Go to My Profile"
          >
            <div className="flex items-center gap-3">
              <div
              className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 overflow-hidden"
              style={{
                backgroundColor: user.avatar ? 'transparent' : roleColors[user.role],
                color: '#005F02'
              }}>

                {user.avatar ? (
                  <img src={assetUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0">
                <div className="text-[#eeece8] text-sm font-medium truncate">
                  {user.name}
                </div>
                <div className="text-[#eeece8] text-xs truncate">
                  {roleLabels[user.role]}
                </div>
              </div>
            </div>
            {user.role === 'admin' &&
          <div className="mt-2 flex items-center gap-1 text-[#eeece8] text-xs">
                <Shield size={12} />
                <span>{t('fullAccess')}</span>
              </div>
          }
          </button>
        }

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto py-2">
          {visibleItems.map((item) => {
            const isActive = currentPage === item.id;
            return (
              <button
                key={item.id}
                onClick={() => navigate(item.id)}
                className={`
                  w-full flex items-center gap-3 px-4 py-2.5 text-left
                  transition-colors duration-150 relative
                  ${isActive ? 'bg-[#1e6d1e] text-[#eeece8] border-l-4 border-[#eeece8]' : 'text-[#eeece8] hover:bg-[#3f853f] hover:text-white border-l-4 border-transparent'}
                `}>

                <span className="flex-shrink-0">{item.icon}</span>
                {isOpen &&
                <>
                    <span className="text-sm font-medium flex-1 truncate">
                      {item.label}
                    </span>
                    {item.badge !== undefined && item.badge > 0 &&
                  <span className="bg-red-500 text-white text-xs rounded-full px-1.5 py-0.5 min-w-[20px] text-center">
                        {item.badge}
                      </span>
                  }
                  </>
                }
                {!isOpen && item.badge !== undefined && item.badge > 0 &&
                <span className="absolute top-1 right-1 w-2 h-2 bg-red-500 rounded-full" />
                }
              </button>);

          })}
        </nav>

        {/* Logout */}
        <div className="border-t border-[#427A43] p-2">
          <button
            onClick={logout}
            className="w-full flex items-center gap-3 px-4 py-2.5 text-[#eeece8] hover:bg-red-700 hover:text-white rounded transition-colors">

            <LogOut size={18} className="flex-shrink-0" />
            {isOpen && <span className="text-sm font-medium">{t('logout')}</span>}
          </button>
        </div>
      </div>
    </>);

}