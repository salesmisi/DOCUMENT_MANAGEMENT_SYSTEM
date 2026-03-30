import React, { useState, useEffect, useCallback } from 'react';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Bell, Globe, Shield, Smartphone, Monitor, Image } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { useLanguage } from '../context/LanguageContext';
import { LogoSettings } from '../components/LogoSettings';

const API_URL = 'http://localhost:5000/api';

export function SettingsPage() {
  const { changePassword, logout, token, user } = useAuth();
  const [notifications, setNotifications] = useState({
    email: true,
    browser: true,
    approvals: true,
  });
  const [saving, setSaving] = useState(false);
  const { theme, setTheme } = useTheme();
  const [appearance, setAppearance] = useState({
    theme: theme || 'light',
    density: 'comfortable'
  });
  const LANG_KEY = 'dms_language';
  const TZ_KEY = 'dms_timezone';

  const { t, setLang, lang } = useLanguage();

  const [language, setLanguage] = useState<string>(() => {
    const stored = localStorage.getItem(LANG_KEY);
    if (stored) return stored;
    return lang === 'tl' ? 'Tagalog' : 'English (US)';
  });
  const [timezone, setTimezone] = useState<string>(() => {
    return localStorage.getItem(TZ_KEY) || 'Pacific Time (US & Canada)';
  });

  useEffect(() => {
    // persist language/timezone selections
    localStorage.setItem(LANG_KEY, language);
    localStorage.setItem(TZ_KEY, timezone);
    // apply document language for simple cases
    if (language === 'Tagalog') {
      document.documentElement.lang = 'tl';
      setLang('tl');
    } else {
      document.documentElement.lang = 'en';
      setLang('en');
    }
    // expose timezone on window for other parts of the app if needed
    try {
      (window as any).DMS_TIMEZONE = timezone;
    } catch (e) {
      // ignore
    }
  }, [language, timezone]);
  // keep appearance.theme in sync with ThemeContext
  useEffect(() => {
    setAppearance((prev) => ({ ...prev, theme: theme }));
  }, [theme]);
  const toggleNotification = (key: keyof typeof notifications) => {
    const newValue = !notifications[key];

    // Request browser notification permission when enabling browser notifications
    if (key === 'browser' && newValue && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission();
    }

    setNotifications((prev) => ({
      ...prev,
      [key]: newValue
    }));
  };

  // Fetch notification preferences from backend on mount
  useEffect(() => {
    if (!token) return;
    (async () => {
      try {
        const res = await fetch(`${API_URL}/notifications/preferences`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setNotifications({
            email: data.emailEnabled,
            browser: data.browserEnabled,
            approvals: data.approvalsEnabled,
          });
        }
      } catch (err) {
        console.error('Failed to load notification preferences:', err);
      }
    })();
  }, [token]);

  // Save notification preferences to backend
  const saveNotificationPreferences = useCallback(async () => {
    if (!token) return;
    setSaving(true);
    try {
      await fetch(`${API_URL}/notifications/preferences`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          emailEnabled: notifications.email,
          browserEnabled: notifications.browser,
          approvalsEnabled: notifications.approvals,
        }),
      });
    } catch (err) {
      console.error('Failed to save notification preferences:', err);
    } finally {
      setSaving(false);
    }
  }, [token, notifications]);

  // Auto-save when notification toggles change (debounced)
  useEffect(() => {
    if (!token) return;
    const timer = setTimeout(() => {
      saveNotificationPreferences();
    }, 500);
    return () => clearTimeout(timer);
  }, [notifications, saveNotificationPreferences]);

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900">{t('settings')}</h2>
        <p className="text-gray-500">{t('settingsDescription')}</p>
      </div>

      {/* Notifications Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-blue-50 rounded-lg">
            <Bell className="text-blue-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('notifications')}</h3>
            <p className="text-sm text-gray-500">{t('notificationsDescription')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">{t('emailNotificationsTitle')}</p>
              <p className="text-sm text-gray-500">{t('emailNotificationsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.email}
                onChange={() => toggleNotification('email')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-3 border-b border-gray-100">
            <div>
              <p className="font-medium text-gray-900">{t('browserNotificationsTitle')}</p>
              <p className="text-sm text-gray-500">{t('browserNotificationsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.browser}
                onChange={() => toggleNotification('browser')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>

          <div className="flex items-center justify-between py-3">
            <div>
              <p className="font-medium text-gray-900">{t('approvalRequestsTitle')}</p>
              <p className="text-sm text-gray-500">{t('approvalRequestsDesc')}</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input
                type="checkbox"
                className="sr-only peer"
                checked={notifications.approvals}
                onChange={() => toggleNotification('approvals')} />

              <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
            </label>
          </div>
        </div>
      </Card>

      {/* Appearance Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-purple-50 rounded-lg">
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('appearance')}</h3>
            <p className="text-sm text-gray-500">{t('appearanceDescription')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <button
            onClick={() => {
              setAppearance({ ...appearance, theme: 'light' });
              setTheme('light');
            }}
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'light' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-white border border-gray-200 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">{t('lightMode')}</span>
          </button>

          <button
            onClick={() => {
              setAppearance({ ...appearance, theme: 'dark' });
              setTheme('dark');
            }}
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'dark' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-gray-900 border border-gray-700 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">{t('darkMode')}</span>
          </button>

          <button
            onClick={() => {
              setAppearance({ ...appearance, theme: 'system' });
              setTheme('system');
            }}
            className={`p-4 border-2 rounded-xl flex flex-col items-center gap-3 transition-all ${appearance.theme === 'system' ? 'border-purple-600 bg-purple-50' : 'border-gray-200 hover:border-gray-300'}`}>

            <div className="w-full h-24 bg-gradient-to-r from-white to-gray-900 border border-gray-200 rounded-lg shadow-sm"></div>
            <span className="font-medium text-gray-900">{t('system')}</span>
          </button>
        </div>
      </Card>

      {/* Logo Settings Section - Admin Only */}
      {user?.role === 'admin' && (
        <Card className="p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-indigo-50 rounded-lg">
              <Image className="text-indigo-600" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-gray-900">{t('logoSettings') || 'Logo Settings'}</h3>
              <p className="text-sm text-gray-500">{t('logoSettingsDesc') || 'Change the logo'}</p>
            </div>
          </div>
          <LogoSettings />
        </Card>
      )}

      {/* Regional Section */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-green-50 rounded-lg">
            <Globe className="text-green-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('regional')}</h3>
            <p className="text-sm text-gray-500">{t('regional')}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('language')}
            </label>
            <select value={language} onChange={(e) => setLanguage(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option>English (US)</option>
              <option>Tagalog</option>
            </select>
          </div>
          <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
              {t('timezone')}
            </label>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)} className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500">
              <option>Pacific Time (US & Canada)</option>
              <option>Eastern Time (US & Canada)</option>
              <option>London (GMT)</option>
              <option>Tokyo (JST)</option>
              <option>Philippine Time (PHT)</option>
            </select>
          </div>
        </div>
      </Card>

      {/* Sessions */}
      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-gray-50 rounded-lg">
            <Shield className="text-gray-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('security')}</h3>
            <p className="text-sm text-gray-500">{t('securityDesc')}</p>
          </div>
        </div>

        <SecurityForm changePassword={changePassword} logout={logout} />
      </Card>

      <Card className="p-6">
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-orange-50 rounded-lg">
            <Shield className="text-orange-600" size={24} />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-gray-900">{t('activeSessions')}</h3>
            <p className="text-sm text-gray-500">{t('manageActiveSessions')}</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <Monitor className="text-gray-400" size={24} />
              <div>
                <p className="font-medium text-gray-900">Windows PC - Chrome</p>
                <p className="text-xs text-gray-500">
                  San Francisco, CA • Active now
                </p>
              </div>
            </div>
            <span className="px-2 py-1 bg-green-100 text-green-700 text-xs font-medium rounded-full">
              {t('current') || 'Current'}
            </span>
          </div>

          <div className="flex items-center justify-between p-4 bg-white rounded-lg border border-gray-100">
            <div className="flex items-center gap-4">
              <Smartphone className="text-gray-400" size={24} />
              <div>
                <p className="font-medium text-gray-900">iPhone 13 - Safari</p>
                <p className="text-xs text-gray-500">
                  San Francisco, CA • 2 hours ago
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm">
              {t('revoke')}
            </Button>
          </div>
        </div>
      </Card>

      <div className="flex justify-end gap-3">
        <Button variant="outline">{t('cancel')}</Button>
        <Button>{t('savePreferences')}</Button>
      </div>
    </div>);

}

function SecurityForm({ changePassword, logout }: { changePassword: (c:string,n:string)=>Promise<boolean>; logout: ()=>void }) {
  const { t } = useLanguage();
  const [formData, setFormData] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordMsgType, setPasswordMsgType] = useState<'error'|'success'|''>('');

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(''); setPasswordMsgType('');
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setPasswordMessage('Please fill all password fields'); setPasswordMsgType('error'); return;
    }
    if (formData.newPassword.length < 6) { setPasswordMessage('New password must be at least 6 characters'); setPasswordMsgType('error'); return; }
    if (formData.newPassword !== formData.confirmPassword) { setPasswordMessage('New password and confirm password do not match'); setPasswordMsgType('error'); return; }

    try {
      const ok = await changePassword(formData.currentPassword, formData.newPassword);
      if (ok) {
        setPasswordMessage('Password changed — you will be logged out'); setPasswordMsgType('success');
        setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' });
        setTimeout(() => logout(), 1200);
      } else {
        setPasswordMessage('Failed to change password — check current password'); setPasswordMsgType('error');
      }
    } catch (err) {
      console.error(err); setPasswordMessage('Network error — could not change password'); setPasswordMsgType('error');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {passwordMessage && (
        <div className="w-full flex justify-center">
          <div className={`px-4 py-2 rounded text-sm ${passwordMsgType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {passwordMessage}
          </div>
        </div>
      )}

      <Input label={t('currentPassword')} name="currentPassword" type="password" value={formData.currentPassword} onChange={handleChange} />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Input label={t('newPassword')} name="newPassword" type="password" value={formData.newPassword} onChange={handleChange} />
        <Input label={t('confirmNewPassword')} name="confirmPassword" type="password" value={formData.confirmPassword} onChange={handleChange} />
      </div>
      <div className="flex justify-end pt-4">
        <Button variant="outline" type="button" onClick={() => { setFormData({ currentPassword: '', newPassword: '', confirmPassword: '' }); setPasswordMessage(''); setPasswordMsgType(''); }}>
          {t('cancel')}
        </Button>
        <Button type="submit">{t('updatePassword')}</Button>
      </div>
    </form>
  );
}