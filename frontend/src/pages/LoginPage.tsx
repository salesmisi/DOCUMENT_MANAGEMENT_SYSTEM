import React, { useState } from 'react';
import { Eye, EyeOff, Lock, Mail } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useLanguage } from '../context/LanguageContext';
import { useNavigation } from '../App';
import { useLogo, LOGO_SIZES } from '../context/LogoContext';
import { apiUrl } from '../utils/api';

export function LoginPage() {
  const { login } = useAuth();
  const { t } = useLanguage();
  const { navigate } = useNavigation();
  const { logo, logoSize } = useLogo();
  const [mode, setMode] = useState<'login' | 'forgot'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [identifier, setIdentifier] = useState('');
  const [recoveryKey, setRecoveryKey] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [showRecoveryKey, setShowRecoveryKey] = useState(false);
  const [success, setSuccess] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!email || !password) {
      setError(t('loginValidation'));
      return;
    }

    setLoading(true);

    const success = await login(email, password);

    if (!success) {
      setError(t('loginError'));
    }

    setLoading(false);
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSuccess('');

    if (!identifier || !recoveryKey || !newPassword || !confirmPassword) {
      setError('Please complete all fields.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(apiUrl('/auth/forgot-password'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier, recoveryKey, newPassword }),
      });

      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || 'Invalid recovery key or user information');
        return;
      }

      setSuccess('Password updated successfully. You can now sign in.');
      setMode('login');
      setEmail(identifier);
      setIdentifier('');
      setRecoveryKey('');
      setNewPassword('');
      setConfirmPassword('');
    } catch {
      setError('Invalid recovery key or user information');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="relative min-h-screen overflow-hidden">

      {/* VIDEO BACKGROUND */}
      <video
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 w-full h-full object-cover"
      >
        <source src="/maptech_bg.mp4" type="video/mp4" />
      </video>

      {/* DARK OVERLAY */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>

      {/* CENTER CONTENT */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-6">
        <div className="w-full max-w-md">

          {/* LOGO SECTION */}
          <div className="text-center mb-8">
            <button
              type="button"
              onClick={() => navigate('dashboard')}
              className="mx-auto block hover:opacity-90 transition-opacity"
              title="Go to Dashboard"
            >
              <img
                src={logo}
                alt="Maptech Logo"
                className={`${LOGO_SIZES[logoSize].width} object-contain mx-auto mb-4`}
              />
            </button>
            <p className="text-white text-lg font-semibold">
              {t('documentManagementSystem')}
            </p>
            <p className="text-white/70 text-xs mt-1">
              {t('maptechCompany')}
            </p>
          </div>

          {/* LOGIN FORM CARD */}
          <div className="bg-white/90 rounded-2xl shadow-2xl p-8 border border-[#C0B87A]/30">

            <h2 className="text-xl font-semibold text-gray-800 mb-6 text-center">
              {t('signIn')}
            </h2>

            {error && (
              <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                {error}
              </div>
            )}

            {success && (
              <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg text-green-700 text-sm">
                {success}
              </div>
            )}

            {mode === 'login' ? (
              <form onSubmit={handleSubmit} className="space-y-4">

                {/* EMAIL */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('emailAddress')}
                  </label>
                  <div className="relative">
                    <Mail
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder={t('emailPlaceholder')}
                      className="w-full pl-10 pr-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] focus:border-transparent"
                    />
                  </div>
                </div>

                {/* PASSWORD */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('password')}
                  </label>
                  <div className="relative">
                    <Lock
                      size={16}
                      className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400"
                    />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder={t('enterPassword')}
                      className="w-full pl-10 pr-10 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] focus:border-transparent"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                    >
                      {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    setMode('forgot');
                    setError('');
                    setSuccess('');
                    setIdentifier(email);
                  }}
                  className="w-full text-right text-sm text-[#005F02] hover:underline"
                >
                  Forgot Password?
                </button>

                {/* SUBMIT */}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-60"
                  style={{
                    backgroundColor: loading ? '#427A43' : '#005F02'
                  }}
                >
                  {loading ? t('signingIn') : t('signIn')}
                </button>

              </form>
            ) : (
              <form onSubmit={handleForgotPassword} className="space-y-4">
                <h3 className="text-center text-base font-semibold text-gray-800">Change Password</h3>
                <p className="text-center text-sm text-gray-500">Use your recovery key to reset your password.</p>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Username or Email</label>
                  <input
                    type="text"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="Enter username or email"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                  />
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Recovery Key</label>
                  <input
                    type={showRecoveryKey ? 'text' : 'password'}
                    value={recoveryKey}
                    onChange={(e) => setRecoveryKey(e.target.value)}
                    placeholder="Enter recovery key"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowRecoveryKey(!showRecoveryKey)}
                    className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                  >
                    {showRecoveryKey ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">New Password</label>
                  <input
                    type={showNewPassword ? 'text' : 'password'}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="Enter new password"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                  >
                    {showNewPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <div className="relative">
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">Confirm Password</label>
                  <input
                    type={showConfirmPassword ? 'text' : 'password'}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Enter new password again"
                    className="w-full px-4 py-2.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                    className="absolute right-3 top-[38px] text-gray-400 hover:text-gray-600"
                  >
                    {showConfirmPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-lg text-white font-semibold text-sm transition-all duration-200 disabled:opacity-60"
                  style={{
                    backgroundColor: loading ? '#427A43' : '#005F02'
                  }}
                >
                  {loading ? 'Resetting...' : 'Change Password'}
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                    setSuccess('');
                  }}
                  className="w-full py-2 border border-gray-300 rounded-lg text-sm text-gray-700 hover:bg-gray-50"
                >
                  Back to Sign In
                </button>
              </form>
            )}
          </div>

          <p className="text-center text-xs text-white/60 mt-6">
            {t('copyright')}
          </p>

        </div>
      </div>

    </div>
  );
}