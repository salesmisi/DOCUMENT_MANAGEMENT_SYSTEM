import React, { useState, createContext, useContext, ReactNode, useEffect } from 'react';
import { apiUrl, assetUrl } from '../utils/api';

const API_URL = apiUrl('');

export interface User {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'manager' | 'staff';
  department: string;
  status: 'active' | 'inactive';
  createdAt: string;
  avatar?: string;
  password?: string; // only used on forms, never stored in state
}

interface AuthContextType {
  user: User | null;
  users: User[];
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => void;
  refreshCurrentUser: () => Promise<void>;
  addUser: (
    userData: Omit<User, 'id' | 'createdAt'> & { password: string }
  ) => Promise<void>;
  updateUser: (id: string, updates: Partial<User>) => Promise<void>;
  updateProfile: (updates: Partial<User>) => void;
  deleteUser: (id: string) => Promise<void>;
  resetPassword: (id: string, newPassword: string) => Promise<boolean>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<boolean>;
  fetchUsers: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export function useAuth() {
  return useContext(AuthContext);
}

const TOKEN_KEY = 'dms_token';
const CURRENT_USER_KEY = 'dms_current_user';

function authHeaders(token: string | null) {
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

function normalizeUser(user: User | null): User | null {
  if (!user) {
    return null;
  }

  return {
    ...user,
    avatar: user.avatar ? assetUrl(user.avatar) : undefined,
  };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // 🔹 INITIAL LOAD — restore session & fetch users list
  useEffect(() => {
    const storedToken = localStorage.getItem(TOKEN_KEY);
    const storedUser = localStorage.getItem(CURRENT_USER_KEY);

    if (storedToken && storedUser) {
      const parsedUser = normalizeUser(JSON.parse(storedUser) as User);
      setToken(storedToken);
      setUser(parsedUser);
      if (parsedUser) {
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(parsedUser));
      }
    }
    setLoading(false);
  }, []);

  // Fetch users from DB once we have a token
  useEffect(() => {
    if (token) {
      fetchUsers();
    }
  }, [token]);

  // 🔹 FETCH USERS from PostgreSQL
  const fetchUsers = async () => {
    try {
      const res = await fetch(`${API_URL}/users`, {
        headers: authHeaders(token),
      });
      if (res.ok) {
        const data = await res.json();
        setUsers(data);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  };

  // 🔹 Refresh current user's data from server (useful when server-side updates occur)
  const refreshCurrentUser = async () => {
    try {
      const stored = localStorage.getItem(CURRENT_USER_KEY);
      const current = stored ? JSON.parse(stored) : user;
      if (!current || !token) return;
      const res = await fetch(`${API_URL}/users/${current.id}`, { headers: authHeaders(token) });
      if (!res.ok) return;
      const updated = normalizeUser(await res.json() as User);
      setUser(updated);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
      // Notify other contexts to refresh data for the updated user
      window.dispatchEvent(new Event('dms-auth-change'));
    } catch (err) {
      console.error('refreshCurrentUser error:', err);
    }
  };

  // 🔹 LOGIN — calls backend /api/auth/login
  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const res = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) return false;

      const data = await res.json();
      const normalizedUser = normalizeUser(data.user as User);
      setToken(data.token);
      setUser(normalizedUser);
      localStorage.setItem(TOKEN_KEY, data.token);
      localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(normalizedUser));
      // Notify DocumentContext to re-fetch data from backend
      window.dispatchEvent(new Event('dms-auth-change'));

      // Log login activity
      try {
        await fetch(`${API_URL}/activity-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${data.token}`,
          },
          body: JSON.stringify({
            action: 'USER_LOGIN',
            target: normalizedUser?.name,
            targetType: 'system',
            userName: normalizedUser?.name,
            userRole: normalizedUser?.role,
            details: `${normalizedUser?.name} logged in`,
          }),
        });
      } catch (logErr) {
        console.error('Failed to log login activity:', logErr);
      }

      return true;
    } catch (err) {
      console.error('Login error:', err);
      return false;
    }
  };

  // 🔹 LOGOUT
  const logout = async () => {
    // Log logout activity before clearing session
    try {
      const authToken = token || localStorage.getItem(TOKEN_KEY);
      if (user && authToken) {
        await fetch(`${API_URL}/activity-logs`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            action: 'USER_LOGOUT',
            target: user.name,
            targetType: 'system',
            userName: user.name,
            userRole: user.role,
            details: `${user.name} logged out`,
          }),
        });
      }
    } catch (logErr) {
      console.error('Failed to log logout activity:', logErr);
    }

    setUser(null);
    setToken(null);
    setUsers([]);
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(CURRENT_USER_KEY);
  };

  // 🔹 ADD USER — POST /api/users
  const addUser = async (
    userData: Omit<User, 'id' | 'createdAt'> & { password: string }
  ) => {
    try {
      const res = await fetch(`${API_URL}/users`, {
        method: 'POST',
        headers: authHeaders(token),
        body: JSON.stringify(userData),
      });

      if (!res.ok) {
        const err = await res.json();
        return { error: err.error || 'Failed to create user' };
      }

      const newUser = await res.json();
      setUsers((prev) => [newUser, ...prev]);
      return { success: true };
    } catch (err) {
      console.error('addUser error:', err);
      return { error: 'Network error — could not create user' };
    }
  };

  // 🔹 UPDATE USER — PUT /api/users/:id
  const updateUser = async (id: string, updates: Partial<User>) => {
    try {
      const res = await fetch(`${API_URL}/users/${id}`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify(updates),
      });

      if (!res.ok) return;

      const updated = normalizeUser(await res.json() as User);
      setUsers((prev) => prev.map((u) => (u.id === id ? updated : u)));

      if (user?.id === id) {
        setUser(updated);
        localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(updated));
        // Notify other contexts to refresh data for the updated user
        window.dispatchEvent(new Event('dms-auth-change'));
      }
    } catch (err) {
      console.error('updateUser error:', err);
    }
  };

  const updateProfile = (updates: Partial<User>) => {
    if (user) updateUser(user.id, updates);
  };

  // 🔹 DELETE USER — DELETE /api/users/:id
  const deleteUser = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/users/${id}`, {
        method: 'DELETE',
        headers: authHeaders(token),
      });

      if (res.ok) {
        setUsers((prev) => prev.filter((u) => u.id !== id));
      }
    } catch (err) {
      console.error('deleteUser error:', err);
    }
  };

  // 🔹 RESET PASSWORD — PUT /api/users/:id/reset-password
  const resetPassword = async (id: string, newPassword: string) => {
    try {
      const res = await fetch(`${API_URL}/users/${id}/reset-password`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ newPassword }),
      });

      if (res.ok) {
        return true;
      } else {
        return false;
      }
    } catch (err) {
      console.error('resetPassword error:', err);
      return false;
    }
  };

  // 🔹 CHANGE PASSWORD — PUT /api/users/:id/change-password
  const changePassword = async (currentPassword: string, newPassword: string) => {
    try {
      if (!user) return false;
      const res = await fetch(`${API_URL}/users/${user.id}/change-password`, {
        method: 'PUT',
        headers: authHeaders(token),
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (res.ok) {
        return true;
      } else {
        const err = await res.json();
        console.error('changePassword failed:', err);
        return false;
      }
    } catch (err) {
      console.error('changePassword error:', err);
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        users,
        token,
        loading,
        login,
        logout,
        addUser,
        updateUser,
        updateProfile,
        deleteUser,
        resetPassword,
        changePassword,
        fetchUsers,
        refreshCurrentUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}