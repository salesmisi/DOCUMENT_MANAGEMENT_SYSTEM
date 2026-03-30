import React, { useState, useMemo } from 'react';
import { XIcon, UserPlusIcon, CheckCircle, XCircle } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';

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
interface CreateUserModalProps {
  isOpen: boolean;
  onClose: () => void;
}
export function CreateUserModal({ isOpen, onClose }: CreateUserModalProps) {
  const { createUser, user: currentUser } = useAuth();
  const { departments, addActivityLog } = useDocuments();
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    password: '',
    confirmPassword: '',
    role: 'staff' as 'admin' | 'manager' | 'staff',
    department: ''
  });
  const [error, setError] = useState('');

  // Password validation state
  const passwordValidation = useMemo(
    () => validatePassword(formData.password),
    [formData.password]
  );

  if (!isOpen) return null;
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!formData.email.endsWith('@maptech.com')) {
      setError('Email address must end with @maptech.com');
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!passwordValidation.isValid) {
      setError('Password does not meet security requirements');
      return;
    }
    try {
      await createUser({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role: formData.role,
        department: formData.department
      });
      if (currentUser) {
        addActivityLog({
          action: 'CREATE_USER',
          userId: currentUser.id,
          userName: currentUser.name,
          details: `Created new user account: ${formData.email} (${formData.role})`,
          ipAddress: '192.168.1.100'
        });
      }
      setFormData({
        name: '',
        email: '',
        password: '',
        confirmPassword: '',
        role: 'staff',
        department: ''
      });
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to create user.');
    }
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-maptech-cream rounded-lg flex items-center justify-center">
              <UserPlusIcon className="text-maptech-primary" size={24} />
            </div>
            <h2 className="text-xl font-bold text-maptech-dark">
              Create New User
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors">

            <XIcon size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {error &&
          <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
              {error}
            </div>
          }

          {/* Full Name */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Full Name *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                name: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              placeholder="Enter full name"
              required />

          </div>

          {/* Email */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Email Address *
            </label>
            <input
              type="email"
              value={formData.email}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                email: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              placeholder="Enter email address"
              required />

          </div>

          {/* Role */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Role *
            </label>
            <select
              value={formData.role}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                role: e.target.value as any
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              required>

              <option value="staff">Staff</option>
              <option value="manager">Manager</option>
              <option value="admin">Admin</option>
            </select>
          </div>

          {/* Department */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Department *
            </label>
            <select
              value={formData.department}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                department: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              required>

              <option value="">Select department</option>
              {departments.map((dept) =>
              <option key={dept.id} value={dept.name}>
                  {dept.name}
                </option>
              )}
            </select>
          </div>

          {/* Password */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Password *
            </label>
            <input
              type="password"
              value={formData.password}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                password: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              placeholder="Enter secure password"
              required />

            {/* Password Rules Checklist */}
            {formData.password.length > 0 && (
              <div className="mt-2 p-3 bg-gray-50 rounded-lg border border-gray-200">
                <p className="text-xs font-medium text-gray-600 mb-2">Password Requirements:</p>
                <div className="grid grid-cols-1 gap-1.5">
                  <div className={`flex items-center gap-2 text-xs ${passwordValidation.minLength ? 'text-green-600' : 'text-gray-500'}`}>
                    {passwordValidation.minLength ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>At least 8 characters</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordValidation.hasUppercase ? 'text-green-600' : 'text-gray-500'}`}>
                    {passwordValidation.hasUppercase ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>One uppercase letter (A-Z)</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordValidation.hasLowercase ? 'text-green-600' : 'text-gray-500'}`}>
                    {passwordValidation.hasLowercase ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>One lowercase letter (a-z)</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordValidation.hasNumber ? 'text-green-600' : 'text-gray-500'}`}>
                    {passwordValidation.hasNumber ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>One number (0-9)</span>
                  </div>
                  <div className={`flex items-center gap-2 text-xs ${passwordValidation.hasSpecial ? 'text-green-600' : 'text-gray-500'}`}>
                    {passwordValidation.hasSpecial ? <CheckCircle size={14} /> : <XCircle size={14} />}
                    <span>One special character (!@#$%^&*)</span>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-sm font-medium text-maptech-dark mb-1.5">
              Confirm Password *
            </label>
            <input
              type="password"
              value={formData.confirmPassword}
              onChange={(e) =>
              setFormData((prev) => ({
                ...prev,
                confirmPassword: e.target.value
              }))
              }
              className="w-full px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-maptech-primary/50 focus:border-maptech-primary"
              placeholder="Confirm password"
              required />

          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2.5 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors font-medium">

              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2.5 bg-maptech-primary text-white rounded-lg hover:bg-maptech-primary/90 transition-colors font-medium">

              Create User
            </button>
          </div>
        </form>
      </div>
    </div>);

}