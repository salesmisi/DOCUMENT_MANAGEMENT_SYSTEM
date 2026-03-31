import React, { useState, useEffect, useMemo } from 'react';
import { Eye, EyeOff, CheckCircle, XCircle } from 'lucide-react';
import {
  Users,
  Plus,
  Edit2,
  Trash2,
  UserCheck,
  UserX,
  Key,
  Building2,
  Search,
  Shield,
  ChevronDown } from
'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useDocuments } from '../context/DocumentContext';
import { AutocompleteSearch } from '../components/AutocompleteSearch';
import { useLanguage } from '../context/LanguageContext';

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

interface Department {
  id: string;
  name: string;
  description: string;
  staffCount: number;
  documentCount: number;
}

export function UserManagement() {
  const { user: currentUser, users, addUser, updateUser, deleteUser, resetPassword } = useAuth();
  const { addLog } = useDocuments();
  const { t } = useLanguage();
  const [search, setSearch] = useState('');
  const [showAddUser, setShowAddUser] = useState(false);
  const [showAddDept, setShowAddDept] = useState(false);
  const [editingUser, setEditingUser] = useState<string | null>(null);
  const [editUserData, setEditUserData] = useState({
    name: '',
    email: '',
    role: 'staff' as 'admin' | 'manager' | 'staff',
    department: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loadingDepts, setLoadingDepts] = useState(true);
  const [activeTab, setActiveTab] = useState<'users' | 'departments'>('users');
  const [newUser, setNewUser] = useState({
    name: '',
    email: '',
    password: '',
    role: 'staff' as 'admin' | 'manager' | 'staff',
    department: '',
    status: 'active' as 'active' | 'inactive'
  });
  const [newDept, setNewDept] = useState({
    name: ''
  });
  // Fix: Only one showPassword state for the password field
  const [showPassword, setShowPassword] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ id: string; name: string } | null>(null);
  const [deleteDeptConfirm, setDeleteDeptConfirm] = useState<{ id: string; name: string } | null>(null);
  const [resetPwUser, setResetPwUser] = useState<{ id: string; name: string } | null>(null);
  const [resetPwValue, setResetPwValue] = useState('');
  const [resetPwShow, setResetPwShow] = useState(false);
  const [resetPwStatus, setResetPwStatus] = useState<'idle' | 'success' | 'error'>('idle');
  const [resetPwError, setResetPwError] = useState('');

  // Fetch departments from API on mount
  const fetchDepartments = async () => {
    try {
      setLoadingDepts(true);
      const token = localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/departments', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments(data.departments || []);
      }
    } catch (err) {
      console.error('Failed to fetch departments:', err);
    } finally {
      setLoadingDepts(false);
    }
  };

  useEffect(() => {
    fetchDepartments();
  }, []);

  // Create department via API
  const handleCreateDepartment = async () => {
    if (!newDept.name) {
      alert(t('departmentNameRequiredMsg'));
      return;
    }
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch('http://localhost:5000/api/departments', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
            body: JSON.stringify({ name: newDept.name })
      });
      if (res.ok) {
        const data = await res.json();
        setDepartments((prev) => [...prev, data.department]);
            setNewDept({ name: '' });
        setShowAddDept(false);
        // Refresh folders so the newly-created department folder is available
        window.dispatchEvent(new Event('dms-folders-refresh'));
        addLog({
          userId: currentUser?.id || '',
          userName: currentUser?.name || '',
          userRole: currentUser?.role || 'admin',
          action: 'CREATE_DEPARTMENT',
          target: newDept.name,
          targetType: 'system',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100',
          details: `Department "${newDept.name}" created`
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to create department');
      }
    } catch (err) {
      console.error('Failed to create department:', err);
      alert('Failed to create department');
    }
  };

  // Delete department via API
  const handleDeleteDepartment = (id: string, name: string) => {
    setDeleteDeptConfirm({ id, name });
  };
  const confirmDeleteDepartment = async () => {
    if (!deleteDeptConfirm) return;
    try {
      const token = localStorage.getItem('dms_token');
      const res = await fetch(`http://localhost:5000/api/departments/${deleteDeptConfirm.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      if (res.ok) {
        setDepartments((prev) => prev.filter((d) => d.id !== deleteDeptConfirm.id));
        window.dispatchEvent(new Event('dms-folders-refresh'));
        addLog({
          userId: currentUser?.id || '',
          userName: currentUser?.name || '',
          userRole: currentUser?.role || 'admin',
          action: 'DEPARTMENT_DELETED',
          target: deleteDeptConfirm.name,
          targetType: 'system',
          timestamp: new Date().toISOString(),
          ipAddress: '192.168.1.100',
          details: `Department "${deleteDeptConfirm.name}" deleted`
        });
      } else {
        const errData = await res.json();
        alert(errData.error || 'Failed to delete department');
      }
    } catch (err) {
      console.error('Failed to delete department:', err);
      alert('Failed to delete department');
    }
    setDeleteDeptConfirm(null);
  };

  const filteredUsers = users.filter(
    (u) =>
    u.name.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase()) ||
    u.department.toLowerCase().includes(search.toLowerCase())
  );
  const userSuggestions = useMemo(() =>
    users.flatMap((u) => [u.name, u.email, u.department]).filter(Boolean),
    [users]
  );
  const [addUserError, setAddUserError] = useState('');
  const handleAddUser = async () => {
    setAddUserError('');
    if (!newUser.name || !newUser.email || !newUser.password || !newUser.department) {
      setAddUserError(t('fillRequiredFields'));
      return;
    }
    const result = await addUser(newUser);
    if (result && result.error) {
      setAddUserError(result.error);
      return;
    }
    addLog({
      userId: currentUser?.id || '',
      userName: currentUser?.name || '',
      userRole: currentUser?.role || 'admin',
      action: 'USER_CREATED',
      target: newUser.name,
      targetType: 'user',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `New ${newUser.role} account created for ${newUser.department}`
    });
    setNewUser({
      name: '',
      email: '',
      password: '',
      role: 'staff',
      department: '',
      status: 'active'
    });
    setShowAddUser(false);
  };
  const handleToggleStatus = async (id: string, currentStatus: string) => {
    const newStatus = currentStatus === 'active' ? 'inactive' : 'active';
    const targetUser = users.find((u) => u.id === id);
    await updateUser(id, {
      status: newStatus as 'active' | 'inactive'
    });
    addLog({
      userId: currentUser?.id || '',
      userName: currentUser?.name || '',
      userRole: currentUser?.role || 'admin',
      action: 'USER_UPDATED',
      target: targetUser?.name || id,
      targetType: 'user',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `Status changed from ${currentStatus} to ${newStatus}`
    });
  };

  const handleEditUser = (u: typeof users[0]) => {
    setEditingUser(u.id);
    setEditUserData({
      name: u.name,
      email: u.email,
      role: u.role,
      department: u.department,
      status: u.status
    });
  };

  const handleSaveEditUser = async () => {
    if (!editingUser) return;
    await updateUser(editingUser, editUserData);
    const targetUser = users.find((u) => u.id === editingUser);
    addLog({
      userId: currentUser?.id || '',
      userName: currentUser?.name || '',
      userRole: currentUser?.role || 'admin',
      action: 'USER_UPDATED',
      target: targetUser?.name || editingUser,
      targetType: 'user',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100',
      details: `User details updated: ${editUserData.name}, ${editUserData.role}, ${editUserData.department}`
    });
    setEditingUser(null);
  };

  const handleDeleteUser = async (id: string, name: string) => {
    setDeleteConfirm({ id, name });
  };
  const confirmDeleteUser = async () => {
    if (!deleteConfirm) return;
    await deleteUser(deleteConfirm.id);
    addLog({
      userId: currentUser?.id || '',
      userName: currentUser?.name || '',
      userRole: currentUser?.role || 'admin',
      action: 'USER_DELETED',
      target: deleteConfirm.name,
      targetType: 'user',
      timestamp: new Date().toISOString(),
      ipAddress: '192.168.1.100'
    });
    // Refresh folders since user's folders were also deleted
    window.dispatchEvent(new Event('dms-folders-refresh'));
    setDeleteConfirm(null);
  };
  const roleColors: Record<string, string> = {
    admin: 'bg-yellow-100 text-yellow-800',
    manager: 'bg-blue-100 text-blue-800',
    staff: 'bg-gray-100 text-gray-700'
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-[#005F02] rounded-2xl p-6 text-white flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold mb-1 flex items-center gap-3">
            <Users size={28} />
            {t('userManagement')}
          </h2>
          <p className="text-[#C0B87A] text-sm">
            {t('manageUsersAndDepts')}
          </p>
        </div>
        <button
          onClick={() => setShowAddUser(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#C0B87A] text-[#005F02] font-semibold text-sm rounded-xl hover:bg-[#F2E3BB] transition-colors">

          <Plus size={18} />
          {t('addUser')}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-white rounded-xl p-1 shadow-sm border border-gray-100 w-fit">
        <button
          onClick={() => setActiveTab('users')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'users' ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>

          {t('users')} ({users.length})
        </button>
        <button
          onClick={() => setActiveTab('departments')}
          className={`px-5 py-2 rounded-lg text-sm font-medium transition-colors ${activeTab === 'departments' ? 'bg-[#005F02] text-white' : 'text-gray-600 hover:bg-gray-100'}`}>

          {t('departments')} ({departments.length})
        </button>
      </div>

      {activeTab === 'users' &&
      <>
          {/* Search */}
          <AutocompleteSearch
            value={search}
            onChange={setSearch}
            suggestions={userSuggestions}
            placeholder={t('searchUsers')}
            className="bg-white rounded-xl px-4 py-3 shadow-sm border border-gray-100 max-w-md"
          />

          {/* Users Table */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {t('user')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden md:table-cell">
                    {t('role')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                    {t('department')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase">
                    {t('status')}
                  </th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-gray-500 uppercase hidden lg:table-cell">
                    {t('created')}
                  </th>
                  <th className="px-4 py-3 text-xs font-semibold text-gray-500 uppercase text-right">
                    {t('actions')}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filteredUsers.map((u) =>
              <tr key={u.id} className="hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <div
                      className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0"
                      style={{
                        backgroundColor:
                        u.role === 'admin' ?
                        '#FEF3C7' :
                        u.role === 'manager' ?
                        '#D1FAE5' :
                        '#EFF6FF',
                        color: '#005F02'
                      }}>

                          {u.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-medium text-gray-800">{u.name}</p>
                          <p className="text-xs text-gray-400">{u.email}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${roleColors[u.role]}`}>

                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 hidden lg:table-cell">
                      {u.department}
                    </td>
                    <td className="px-4 py-3">
                      <span
                    className={`px-2 py-0.5 rounded-full text-xs font-medium ${u.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>

                        {u.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500 text-xs hidden lg:table-cell">
                      {u.createdAt}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 justify-end">
                        <button
                          onClick={() => handleEditUser(u)}
                          className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition-colors"
                          title="Edit User"
                        >
                          <Edit2 size={15} />
                        </button>
                        <button
                      onClick={() => handleToggleStatus(u.id, u.status)}
                      className={`p-1.5 rounded transition-colors ${u.status === 'active' ? 'text-gray-400 hover:text-red-600 hover:bg-red-50' : 'text-gray-400 hover:text-green-600 hover:bg-green-50'}`}
                      title={
                      u.status === 'active' ? t('deactivate') : t('activate')
                      }>

                          {u.status === 'active' ?
                      <UserX size={15} /> :

                      <UserCheck size={15} />
                      }
                        </button>
                        <button
                      onClick={() => { setResetPwUser({ id: u.id, name: u.name }); setResetPwValue(''); setResetPwShow(false); setResetPwStatus('idle'); setResetPwError(''); }}
                      className="p-1.5 text-gray-400 hover:text-orange-600 hover:bg-orange-50 rounded transition-colors"
                      title={t('resetPassword')}>
                          <Key size={15} />
                        </button>
                        {u.id !== 'user-1' &&
                    <button
                      onClick={() => handleDeleteUser(u.id, u.name)}
                      className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                      title={t('deleteUser')}>

                            <Trash2 size={15} />
                          </button>
                    }
                      </div>
                    </td>
                  </tr>
              )}
              </tbody>
            </table>
          </div>
        </>
      }

      {activeTab === 'departments' &&
      <div className="space-y-4">
          <button
          onClick={() => setShowAddDept(true)}
          className="flex items-center gap-2 px-4 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-xl hover:bg-[#427A43] transition-colors">

            <Plus size={16} />
            {t('addDepartment')}
          </button>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {departments.map((dept) =>
          <div
            key={dept.id}
            className="bg-white rounded-xl shadow-sm border border-gray-100 p-5">

                <div className="flex items-start justify-between mb-3">
                  <div className="p-2 bg-[#F0FDF4] rounded-lg">
                    <Building2 size={20} className="text-[#005F02]" />
                  </div>
                  <button
                onClick={() => handleDeleteDepartment(dept.id, dept.name)}
                className="p-1 text-gray-300 hover:text-red-500 transition-colors">

                    <Trash2 size={14} />
                  </button>
                </div>
                <h4 className="font-semibold text-gray-800 mb-1">
                  {dept.name}
                </h4>
                <p className="text-xs text-gray-500 mb-3">{dept.description}</p>
                <div className="flex items-center justify-end text-xs text-gray-500">
                  <span>
                    {dept.staffCount} {t('staffCount')} · {dept.documentCount} {t('docsCount')}
                  </span>
                </div>
              </div>
          )}
          </div>
        </div>
      }

      {/* Add User Modal */}
      {showAddUser &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md relative">
          {/* Custom Error Modal */}
          {addUserError && (
            <div className="fixed inset-0 flex items-center justify-center z-50">
              <div className="bg-white border border-red-300 rounded-xl shadow-2xl px-8 py-6 flex flex-col items-center justify-center">
                <span className="text-red-600 font-semibold text-lg mb-2">{t('error')}</span>
                <span className="text-gray-800 text-center mb-4">{addUserError}</span>
                <button
                  className="mt-2 px-6 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
                  onClick={() => setAddUserError('')}
                >
                  {t('ok')}
                </button>
              </div>
            </div>
          )}
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                {t('addNewUser')}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                {t('createNewAccount')}
              </p>
            </div>
            <div className="p-6 space-y-4">
              {[
            {
              label: t('fullNameRequired'),
              key: 'name',
              type: 'text',
              placeholder: t('johnDoe')
            },
            {
              label: t('emailRequired'),
              key: 'email',
              type: 'email',
              placeholder: t('johnEmail')
            },
            {
              label: t('passwordRequired'),
              key: 'password',
              type: 'password',
              placeholder: t('minSixChars')
            }].
            map((field) => {
              if (field.key === 'password') {
                return (
                  <div key={field.key} className="relative">
                    <label className="block text-sm font-medium text-gray-700 mb-1.5">
                      {field.label}
                    </label>
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={(newUser as any)[field.key]}
                      onChange={(e) =>
                        setNewUser((prev) => ({
                          ...prev,
                          [field.key]: e.target.value
                        }))
                      }
                      placeholder={field.placeholder}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10" />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-700 flex items-center justify-center h-6 w-6 p-0"
                      tabIndex={-1}
                      onClick={() => setShowPassword((v) => !v)}
                      style={{ top: '70%', padding: 0, margin: 0, lineHeight: 0 }}
                    >
                      {showPassword ? <EyeOff size={18} /> : <Eye size={15} />}
                    </button>
                  </div>
                );
              }
              return (
                <div key={field.key}>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {field.label}
                  </label>
                  <input
                    type={field.type}
                    value={(newUser as any)[field.key]}
                    onChange={(e) =>
                      setNewUser((prev) => ({
                        ...prev,
                        [field.key]: e.target.value
                      }))
                    }
                    placeholder={field.placeholder}
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />
                </div>
              );
            })}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('role')}
                  </label>
                  <select
                  value={newUser.role}
                  onChange={(e) =>
                  setNewUser((prev) => ({
                    ...prev,
                    role: e.target.value as any
                  }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">

                    <option value="staff">{t('staff')}</option>
                    <option value="manager">{t('manager')}</option>
                    <option value="admin">{t('admin')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('department')}
                  </label>
                  <select
                  value={newUser.department}
                  onChange={(e) =>
                  setNewUser((prev) => ({
                    ...prev,
                    department: e.target.value
                  }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]">
                    <option value="">{t('selectDepartment')}</option>
                    {departments.map((dept) =>
                  <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                  )}
                  </select>
                </div>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={handleAddUser}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                {t('createUser')}
              </button>
              <button
              onClick={() => setShowAddUser(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      }

      {/* Edit User Modal */}
      {editingUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                Edit User
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Update user details
              </p>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('fullNameRequired')}
                </label>
                <input
                  type="text"
                  value={editUserData.name}
                  onChange={(e) =>
                    setEditUserData((prev) => ({
                      ...prev,
                      name: e.target.value
                    }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('emailRequired')}
                </label>
                <input
                  type="email"
                  value={editUserData.email}
                  onChange={(e) =>
                    setEditUserData((prev) => ({
                      ...prev,
                      email: e.target.value
                    }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('role')}
                  </label>
                  <select
                    value={editUserData.role}
                    onChange={(e) =>
                      setEditUserData((prev) => ({
                        ...prev,
                        role: e.target.value as any
                      }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                  >
                    <option value="staff">{t('staff')}</option>
                    <option value="manager">{t('manager')}</option>
                    <option value="admin">{t('admin')}</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1.5">
                    {t('department')}
                  </label>
                  <select
                    value={editUserData.department}
                    onChange={(e) =>
                      setEditUserData((prev) => ({
                        ...prev,
                        department: e.target.value
                      }))
                    }
                    className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                  >
                    <option value="">{t('selectDepartment')}</option>
                    {departments.map((dept) => (
                      <option key={dept.id} value={dept.name}>
                        {dept.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('status')}
                </label>
                <select
                  value={editUserData.status}
                  onChange={(e) =>
                    setEditUserData((prev) => ({
                      ...prev,
                      status: e.target.value as any
                    }))
                  }
                  className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]"
                >
                  <option value="active">Active</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
                onClick={handleSaveEditUser}
                className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors"
              >
                Save Changes
              </button>
              <button
                onClick={() => setEditingUser(null)}
                className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors"
              >
                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add Department Modal */}
      {showAddDept &&
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-semibold text-gray-800 text-lg">
                {t('addNewDepartment')}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1.5">
                  {t('departmentNameRequired')}
                </label>
                <input
                type="text"
                value={newDept.name}
                onChange={(e) =>
                setNewDept((prev) => ({
                  ...prev,
                  name: e.target.value
                }))
                }
                placeholder={t('egOperations')}
                className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43]" />

              </div>
              {/* Description removed: only department name is required */}
            </div>
            <div className="p-6 pt-0 flex gap-3">
              <button
              onClick={handleCreateDepartment}
              className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-semibold rounded-lg hover:bg-[#427A43] transition-colors">

                {t('createDepartment')}
              </button>
              <button
              onClick={() => setShowAddDept(false)}
              className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">

                {t('cancel')}
              </button>
            </div>
          </div>
        </div>
      }

      {/* Delete User Confirmation Modal */}
      {deleteConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Trash2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('deleteUser')}</h3>
              <p className="text-sm text-gray-600 mb-1">
                {t('deleteUserConfirm')} <span className="font-semibold">"{deleteConfirm.name}"</span>?
              </p>
              <p className="text-sm text-red-600 font-medium mb-5">
                {t('deleteUserWarning')}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={confirmDeleteUser}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                  {t('delete')}
                </button>
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Delete Department Confirmation Modal */}
      {deleteDeptConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center">
              <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center mb-4">
                <Building2 className="text-red-600" size={24} />
              </div>
              <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('deleteDepartment')}</h3>
              <p className="text-sm text-gray-600 mb-1">
                {t('deleteUserConfirm')} <span className="font-semibold">"{deleteDeptConfirm.name}"</span>?
              </p>
              <p className="text-sm text-red-600 font-medium mb-5">
                {t('deleteDeptWarning')}
              </p>
              <div className="flex gap-3 w-full">
                <button
                  onClick={confirmDeleteDepartment}
                  className="flex-1 py-2.5 bg-red-600 text-white text-sm font-medium rounded-lg hover:bg-red-700 transition-colors">
                  {t('delete')}
                </button>
                <button
                  onClick={() => setDeleteDeptConfirm(null)}
                  className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                  {t('cancel')}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* Reset Password Modal */}
      {resetPwUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
            <div className="flex flex-col items-center text-center">
              {resetPwStatus === 'success' ? (
                <>
                  <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mb-4">
                    <UserCheck className="text-green-600" size={24} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('passwordUpdated')}</h3>
                  <p className="text-sm text-gray-600 mb-5">
                    {t('resetPassword')} <span className="font-semibold">"{resetPwUser.name}"</span> {t('passwordResetSuccess')}
                  </p>
                  <button
                    onClick={() => { setResetPwUser(null); setResetPwStatus('idle'); }}
                    className="w-full py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">
                    {t('done')}
                  </button>
                </>
              ) : (
                <>
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4">
                    <Key className="text-orange-600" size={24} />
                  </div>
                  <h3 className="text-lg font-semibold text-gray-800 mb-2">{t('resetPassword')}</h3>
                  <p className="text-sm text-gray-600 mb-4">
                    {t('enterNewPasswordFor')} <span className="font-semibold">"{resetPwUser.name}"</span>
                  </p>
                  {resetPwError && (
                    <p className="text-sm text-red-600 mb-3">{resetPwError}</p>
                  )}
                  <div className="w-full relative mb-3">
                    <input
                      type={resetPwShow ? 'text' : 'password'}
                      value={resetPwValue}
                      onChange={(e) => { setResetPwValue(e.target.value); setResetPwError(''); }}
                      placeholder={t('newPasswordPlaceholder')}
                      className="w-full px-3 py-2.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#427A43] pr-10"
                    />
                    <button
                      type="button"
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-700"
                      onClick={() => setResetPwShow((v) => !v)}
                    >
                      {resetPwShow ? <EyeOff size={18} /> : <Eye size={15} />}
                    </button>
                  </div>
                  {/* Password Rules Checklist */}
                  {resetPwValue.length > 0 && (
                    <div className="w-full mb-4 p-3 bg-gray-50 rounded-lg border border-gray-200 text-left">
                      <p className="text-xs font-medium text-gray-600 mb-2">Password Requirements:</p>
                      <div className="grid grid-cols-1 gap-1.5">
                        {(() => {
                          const validation = validatePassword(resetPwValue);
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
                  <div className="flex gap-3 w-full">
                    <button
                      onClick={async () => {
                        const validation = validatePassword(resetPwValue);
                        if (!validation.isValid) {
                          setResetPwError('Password does not meet security requirements');
                          return;
                        }
                        const success = await resetPassword(resetPwUser.id, resetPwValue);
                        if (success) {
                          addLog({
                            userId: currentUser?.id || '',
                            userName: currentUser?.name || '',
                            userRole: currentUser?.role || 'admin',
                            action: 'RESET_PASSWORD',                            target: resetPwUser.name,
                            targetType: 'user',
                            timestamp: new Date().toISOString(),
                            ipAddress: '192.168.1.100',
                            details: `Password reset for ${resetPwUser.name}`,
                          });
                          setResetPwStatus('success');
                        } else {
                          setResetPwError(t('failedResetPassword'));
                        }
                      }}
                      className="flex-1 py-2.5 bg-[#005F02] text-white text-sm font-medium rounded-lg hover:bg-[#427A43] transition-colors">
                      {t('resetPassword')}
                    </button>
                    <button
                      onClick={() => { setResetPwUser(null); setResetPwStatus('idle'); }}
                      className="flex-1 py-2.5 border border-gray-300 text-gray-600 text-sm font-medium rounded-lg hover:bg-gray-50 transition-colors">
                      {t('cancel')}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>);

}
