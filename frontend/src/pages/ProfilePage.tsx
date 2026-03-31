import React, { useState, useRef, useMemo } from 'react';
import { useAuth } from '../context/AuthContext';
import { Card } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Badge } from '../components/ui/Badge';
import { User, Mail, Building, Shield, Camera, Save, Lock, CheckCircle, XCircle } from 'lucide-react';
import { useLanguage } from '../context/LanguageContext';

const API_URL = 'http://localhost:5000/api';

// Password validation rules
const PASSWORD_RULES = {
  minLength: 8,
  hasUppercase: /[A-Z]/,
  hasLowercase: /[a-z]/,
  hasNumber: /[0-9]/,
  hasSpecial: /[!@#$%^&*(),.?":{}|<>_\-+=\[\]\\\/`~;']/,
};

interface PasswordValidation {
  minLength: boolean;
  hasUppercase: boolean;
  hasLowercase: boolean;
  hasNumber: boolean;
  hasSpecial: boolean;
  isValid: boolean;
}

const validatePassword = (password: string): PasswordValidation => {
  const minLength = password.length >= PASSWORD_RULES.minLength;
  const hasUppercase = PASSWORD_RULES.hasUppercase.test(password);
  const hasLowercase = PASSWORD_RULES.hasLowercase.test(password);
  const hasNumber = PASSWORD_RULES.hasNumber.test(password);
  const hasSpecial = PASSWORD_RULES.hasSpecial.test(password);

  return {
    minLength,
    hasUppercase,
    hasLowercase,
    hasNumber,
    hasSpecial,
    isValid: minLength && hasUppercase && hasLowercase && hasNumber && hasSpecial,
  };
};

export function ProfilePage() {
  const { user, updateProfile, changePassword, logout, refreshCurrentUser } = useAuth();
  const { t } = useLanguage();
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [passwordMsgType, setPasswordMsgType] = useState<'error' | 'success' | ''>('');
  const [avatarUploading, setAvatarUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    department: user?.department || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    const formPayload = new FormData();
    formPayload.append('avatar', file);

    setAvatarUploading(true);
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`${API_URL}/users/${user.id}/avatar`, {
        method: 'POST',
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: formPayload,
      });
      if (res.ok) {
        await refreshCurrentUser?.();
        setSuccessMessage('Profile photo updated');
        setTimeout(() => setSuccessMessage(''), 3000);
      }
    } catch (err) {
      console.error('Avatar upload error:', err);
    } finally {
      setAvatarUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };
  const handleProfileUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setSuccessMessage('');
    // Simulate API call
    await new Promise((resolve) => setTimeout(resolve, 1000));
    updateProfile({
      name: formData.name,
      email: formData.email
      // In a real app, we might update department here if allowed
    });
    setIsLoading(false);
    setSuccessMessage('Profile updated successfully');
    setTimeout(() => setSuccessMessage(''), 3000);
  };
  const handlePasswordUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage('');
    setPasswordMsgType('');
    if (!formData.currentPassword || !formData.newPassword || !formData.confirmPassword) {
      setPasswordMessage('Please fill all password fields');
      setPasswordMsgType('error');
      return;
    }
    const passwordValidation = validatePassword(formData.newPassword);
    if (!passwordValidation.isValid) {
      setPasswordMessage('Password does not meet security requirements');
      setPasswordMsgType('error');
      return;
    }
    if (formData.newPassword !== formData.confirmPassword) {
      setPasswordMessage('New password and confirm password do not match');
      setPasswordMsgType('error');
      return;
    }

    try {
      const ok = await changePassword(formData.currentPassword, formData.newPassword);
      if (ok) {
        setPasswordMessage('Password changed — you will be logged out');
        setPasswordMsgType('success');
        // clear fields
        setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' });
        // give user a moment to see the message then logout
        setTimeout(() => {
          logout();
        }, 1200);
      } else {
        setPasswordMessage('Failed to change password — check current password');
        setPasswordMsgType('error');
      }
    } catch (err) {
      console.error('handlePasswordUpdate error:', err);
      setPasswordMessage('Network error — could not change password');
      setPasswordMsgType('error');
    }
  };
  if (!user) return null;
  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-col md:flex-row gap-6">
        {/* Left Column - Avatar & Identity */}
        <div className="w-full md:w-1/3 space-y-6">
          <Card className="p-6 flex flex-col items-center text-center">
            <div className="relative mb-4 group">
              <div className="w-32 h-32 rounded-full bg-primary/10 flex items-center justify-center text-4xl font-bold text-primary border-4 border-white shadow-lg overflow-hidden">
                {user.avatar ? (
                  <img src={`http://localhost:5000${user.avatar}`} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  user.name.charAt(0).toUpperCase()
                )}
              </div>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                onChange={handleAvatarChange}
              />
              <button
                onClick={handleAvatarClick}
                disabled={avatarUploading}
                className="absolute bottom-0 right-0 p-2 bg-white rounded-full shadow-md border border-gray-200 hover:bg-gray-50 text-gray-600 transition-colors"
              >
                {avatarUploading ? (
                  <div className="w-[18px] h-[18px] border-2 border-gray-400 border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Camera size={18} />
                )}
              </button>
            </div>

            <h2 className="text-xl font-bold text-gray-900">{user.name}</h2>
            <p className="text-gray-500 mb-4">{user.email}</p>

            <div className="flex flex-wrap gap-2 justify-center mb-6">
              <Badge
                variant={
                user.role === 'admin' ?
                'danger' :
                user.role === 'manager' ?
                'warning' :
                'success'
                }>

                {user.role.toUpperCase()}
              </Badge>
              <Badge variant="default">{user.department}</Badge>
            </div>

            <div className="w-full border-t border-gray-100 pt-4 text-left text-sm text-gray-600 space-y-2">
              <div className="flex justify-between">
                <span>Member since</span>
                <span className="font-medium">{user.createdAt}</span>
              </div>
              <div className="flex justify-between">
                <span>Status</span>
                <span className="text-green-600 font-medium flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-green-500"></span>
                  Active
                </span>
              </div>
            </div>
          </Card>
        </div>

        {/* Right Column - Edit Profile */}
        <div className="w-full md:w-2/3 space-y-6">
          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
              <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                  <User size={20} className="text-gray-400" />
                  {t('profileDetails')}
                </h3>
            </div>

            <form onSubmit={handleProfileUpdate} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Full Name"
                  name="name"
                  value={formData.name}
                  onChange={handleChange}
                  placeholder="Enter your full name" />

                <Input
                  label="Email Address"
                  name="email"
                  type="email"
                  value={formData.email}
                  onChange={handleChange}
                  placeholder="name@company.com" />

              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Department"
                  name="department"
                  value={formData.department}
                  disabled={user.role !== 'admin'}
                  readOnly={user.role !== 'admin'}
                  helperText={
                  user.role !== 'admin' ?
                  'Contact admin to change department' :
                  ''
                  } />

                <div className="w-full">
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Role
                  </label>
                  <div className="flex h-10 w-full items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-sm text-gray-500">
                    <Shield size={16} className="mr-2" />
                    {user.role.charAt(0).toUpperCase() + user.role.slice(1)}
                  </div>
                  <p className="mt-1 text-xs text-gray-500">
                    Roles cannot be changed by user
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-gray-100 mt-6">
                {successMessage ?
                <span className="text-green-600 text-sm font-medium animate-fade-in">
                    {successMessage}
                  </span> :

                <span></span>
                }
                <Button
                  type="submit"
                  isLoading={isLoading}
                  leftIcon={<Save size={16} />}>

                  {t('savePreferences')}
                </Button>
              </div>
            </form>
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
                <Lock size={20} className="text-gray-400" />
                {t('security')}
              </h3>
            </div>

            <form onSubmit={handlePasswordUpdate} className="space-y-4">
                {passwordMessage && (
                  <div className="w-full flex justify-center">
                    <div
                      className={`px-4 py-2 rounded text-sm ${passwordMsgType === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}
                    >
                      {passwordMessage}
                    </div>
                  </div>
                )}
              <Input
                label={t('currentPassword')}
                name="currentPassword"
                type="password"
                value={formData.currentPassword}
                onChange={handleChange} />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label={t('newPassword')}
                  name="newPassword"
                  type="password"
                  value={formData.newPassword}
                  onChange={handleChange} />

                <Input
                  label={t('confirmNewPassword')}
                  name="confirmPassword"
                  type="password"
                  value={formData.confirmPassword}
                  onChange={handleChange} />

              </div>
              {/* Password Rules Checklist */}
              {formData.newPassword.length > 0 && (
                <div className="p-3 bg-gray-50 rounded-lg border border-gray-200">
                  <p className="text-xs font-medium text-gray-600 mb-2">Password Requirements:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-1.5">
                    {(() => {
                      const validation = validatePassword(formData.newPassword);
                      return (
                        <>
                          <div className={`flex items-center gap-2 text-xs ${validation.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                            {validation.minLength ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span>At least 8 characters</span>
                          </div>
                          <div className={`flex items-center gap-2 text-xs ${validation.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                            {validation.hasUppercase ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span>One uppercase letter (A-Z)</span>
                          </div>
                          <div className={`flex items-center gap-2 text-xs ${validation.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                            {validation.hasLowercase ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span>One lowercase letter (a-z)</span>
                          </div>
                          <div className={`flex items-center gap-2 text-xs ${validation.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                            {validation.hasNumber ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span>One number (0-9)</span>
                          </div>
                          <div className={`flex items-center gap-2 text-xs ${validation.hasSpecial ? 'text-green-600' : 'text-gray-500'}`}>
                            {validation.hasSpecial ? <CheckCircle size={14} /> : <XCircle size={14} />}
                            <span>One special character (!@#$%^&*)</span>
                          </div>
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}
              <div className="flex justify-end pt-4">
                <Button variant="outline" type="submit">
                  {t('updatePassword')}
                </Button>
              </div>
            </form>
          </Card>
        </div>
      </div>
    </div>);

}