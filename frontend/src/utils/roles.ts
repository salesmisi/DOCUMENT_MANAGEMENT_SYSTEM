import type { User } from '../context/AuthContext';

export function hasApprovalAccess(user?: User | null) {
  if (!user) return false;
  return user.role === 'manager' || user.role === 'admin';
}

export default hasApprovalAccess;
