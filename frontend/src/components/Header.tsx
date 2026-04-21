import React, { useState } from 'react';
import { Menu, Bell, ChevronDown, User, Settings, LogOut, FileText, CheckCheck } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useNavigation, PageName } from '../App';
import { useDocuments } from '../context/DocumentContext';
import { useNotifications } from '../context/NotificationContext';
import { hasApprovalAccess } from '../utils/roles';
import { assetUrl } from '../utils/api';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
interface HeaderProps {
  onMenuToggle: () => void;
  currentPage: PageName;
}
const pageTitles: Record<PageName, string> = {} as any;
export function Header({ onMenuToggle, currentPage }: HeaderProps) {
  const { user, logout } = useAuth();
  const { navigate } = useNavigation();
  const { documents } = useDocuments();
  const { notifications: dbNotifications, unreadCount, markAsRead, markAllAsRead, deleteNotification } = useNotifications();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const isApprover = hasApprovalAccess(user);

  // Use backend unread count for the badge
  const pendingCount = unreadCount;

  // Use backend notifications for the dropdown; fall back to documents if none in DB yet
      const notifications = dbNotifications.length > 0
    ? dbNotifications.slice(0, 20).map((n) => ({
        id: n.id,
        title: n.title,
        message: n.message,
        time: n.createdAt,
        type: n.type,
        documentId: n.documentId,
        createdAt: n.createdAt,
        isRead: n.isRead,
      }))
    : isApprover
    ? documents
        .filter((d) => d.status === 'pending')
        .slice(0, 5)
        .map((d) => ({
          id: d.id,
          title: t('approvalNeeded'),
          message: `"${d.title}" ${t('needsApproval')}`,
          time: d.date,
          type: 'approval',
          documentId: d.id,
          createdAt: d.date,
        }))
    : [];
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
    <header className="bg-white dark:bg-[#1e1e1e] border-b-2 border-[#427A43] px-4 py-3 flex items-center gap-4 z-10 flex-shrink-0">
      {/* Menu Toggle */}
      <button
        onClick={onMenuToggle}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">

        <Menu size={20} />
      </button>

      {/* Page Title */}
      <div className="flex-1">
        <h1 className="text-lg font-semibold text-[#005F02] dark:text-[#7bc67e]">
          {t(`pageTitles.${currentPage}`) || 'Dashboard'}
        </h1>
        <p className="text-xs text-gray-500 dark:text-gray-400">
          {t('maptechSubtitle')}
        </p>
      </div>

      {/* Dark Mode Toggle */}
      <button
        onClick={toggleTheme}
        className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300"
        title={theme === 'dark' ? t('switchToLightMode') : t('switchToDarkMode')}>
      </button>


      {/* Notifications */}
      <div className="relative">
        <button
          onClick={() => {
            setShowNotifications(!showNotifications);
            setShowUserMenu(false);
          }}
          className="relative p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors text-gray-600 dark:text-gray-300">
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
              {unreadCount > 9 ? '9+' : unreadCount}
            </span>
          )}
        </button>

        {showNotifications && (
          <div className="absolute right-0 top-full mt-2 w-80 bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <h3 className="font-semibold text-gray-800 dark:text-gray-100">{t('notifications')}</h3>
              <p className="text-xs text-gray-500 dark:text-gray-400">{unreadCount} {t('unread')}</p>
            </div>
            <div className="max-h-64 overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-6 text-center text-gray-500 dark:text-gray-400 text-sm">{t('noNotifications')}</div>
              ) : (
                notifications.map((n) => {
                  let icon, iconBg, label, onClick, shouldDelete = false;
                  if (n.type === 'activity-log-export') {
                    icon = <FileText size={14} className="text-orange-600" />;
                    iconBg = 'bg-orange-100';
                    label = t('activityLogExport');
                    onClick = () => { navigate('activity-log'); setShowNotifications(false); };
                    shouldDelete = true; // Delete this notification when clicked
                  } else if (n.type === 'delete-request') {
                    icon = <FileText size={14} className="text-red-600" />;
                    iconBg = 'bg-red-100';
                    label = t('deleteRequest');
                    onClick = () => { navigate('admin-delete-requests'); setShowNotifications(false); };
                  } else if (n.type === 'delete-approved') {
                    icon = <CheckCheck size={14} className="text-green-600" />;
                    iconBg = 'bg-green-100';
                    label = t('deleteApproved');
                    onClick = () => { setShowNotifications(false); };
                  } else if (n.type === 'delete-denied') {
                    icon = <FileText size={14} className="text-gray-600" />;
                    iconBg = 'bg-gray-200';
                    label = t('deleteDenied');
                    onClick = () => { setShowNotifications(false); };
                  } else {
                    icon = <FileText size={14} className="text-yellow-600" />;
                    iconBg = 'bg-yellow-100';
                    label = n.type.charAt(0).toUpperCase() + n.type.slice(1);
                    onClick = () => { setShowNotifications(false); };
                  }
                  return (
                    <button
                      key={n.id}
                      onClick={async () => {
                        if (shouldDelete) {
                          await deleteNotification(n.id);
                        } else {
                          await markAsRead(n.id);
                        }
                        onClick();
                      }}
                      className={`w-full flex items-start gap-3 px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors text-left ${n.isRead ? 'opacity-60' : 'bg-[#f0fdf4]'}`}>
                      <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5 ${iconBg}`}>
                        {icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className={`text-xs font-semibold ${n.isRead ? 'text-gray-500' : 'text-gray-700'} dark:text-gray-200`}>{label}</p>
                        <p className={`text-sm truncate ${n.isRead ? 'text-gray-500' : 'text-gray-800 font-medium'} dark:text-gray-200`}>{n.title}</p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{n.message}</p>
                        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">{new Date(n.createdAt).toLocaleString()}</p>
                      </div>
                    </button>
                  );
                })
              )}
            </div>
            {notifications.length > 0 && (
              <div className="px-4 py-2 border-t border-gray-100 dark:border-gray-700 flex items-center justify-between">
                <button
                  onClick={async () => { await markAllAsRead(); }}
                  className="flex items-center gap-1 text-xs text-gray-500 hover:text-[#005F02] transition-colors"
                  title="Mark all as read">
                  <CheckCheck size={14} />
                  {t('markAllRead')}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* User Menu */}
      <div className="relative">
        <button
          onClick={() => {
            setShowUserMenu(!showUserMenu);
            setShowNotifications(false);
          }}
          className="flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">

          <div
            className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold overflow-hidden"
            style={{
              backgroundColor: user?.avatar ? 'transparent' : roleColors[user?.role || 'staff'],
              color: '#005F02'
            }}>

            {user?.avatar ? (
              <img src={assetUrl(user.avatar)} alt="" className="w-full h-full object-cover" />
            ) : (
              user?.name?.charAt(0).toUpperCase() || 'U'
            )}
          </div>
          <div className="hidden md:block text-left">
            <p className="text-sm font-medium text-gray-800 dark:text-gray-200 leading-tight">
              {user?.name}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              {roleLabels[user?.role || 'staff']}
            </p>
          </div>
          <ChevronDown size={16} className="text-gray-400 dark:text-gray-500 hidden md:block" />
        </button>

        {showUserMenu &&
        <div className="absolute right-0 top-full mt-2 w-56 bg-white dark:bg-[#1e1e1e] rounded-xl shadow-xl border border-gray-200 dark:border-gray-700 z-50">
            <div className="px-4 py-3 border-b border-gray-100 dark:border-gray-700">
              <p className="font-semibold text-gray-800 dark:text-gray-100">{user?.name}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400">{user?.email}</p>
              <span
              className="inline-block mt-1 px-2 py-0.5 rounded-full text-xs font-medium"
              style={{
                backgroundColor:
                user?.role === 'admin' ?
                '#FEF3C7' :
                user?.role === 'manager' ?
                '#D1FAE5' :
                '#EFF6FF',
                color:
                user?.role === 'admin' ?
                '#92400E' :
                user?.role === 'manager' ?
                '#065F46' :
                '#1E40AF'
              }}>

                {roleLabels[user?.role || 'staff']}
              </span>
            </div>
            <div className="py-1">
              <button
              onClick={() => {
                navigate('profile');
                setShowUserMenu(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">

                <User size={16} className="text-gray-400" />
                {t('myProfile')}
              </button>
              <button
              onClick={() => {
                navigate('settings');
                setShowUserMenu(false);
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">

                <Settings size={16} className="text-gray-400" />
                {t('settings')}
              </button>
            </div>
            <div className="border-t border-gray-100 dark:border-gray-700 py-1">
              <button
              onClick={() => {
                setShowUserMenu(false);
                logout();
              }}
              className="w-full flex items-center gap-3 px-4 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors">

                <LogOut size={16} />
                {t('signOut')}
              </button>
            </div>
          </div>
        }
      </div>

      {/* Click outside to close menus */}
      {(showUserMenu || showNotifications) &&
      <div
        className="fixed inset-0 z-40"
        onClick={() => {
          setShowUserMenu(false);
          setShowNotifications(false);
        }} />

      }
    </header>);

}