import React, {
  useState,
  createContext,
  useContext,
  useEffect,
  useCallback,
  useRef,
  ReactNode,
} from 'react';
import { useAuth } from './AuthContext';

const API_URL = 'http://localhost:5000/api';

export interface Notification {
  id: string;
  userId: string;
  type: string;
  title: string;
  message: string;
  documentId: string | null;
  isRead: boolean;
  createdAt: string;
}

interface NotificationPreferences {
  emailEnabled: boolean;
  browserEnabled: boolean;
  approvalsEnabled: boolean;
}

interface NotificationContextType {
  notifications: Notification[];
  unreadCount: number;
  loading: boolean;
  preferences: NotificationPreferences;
  fetchNotifications: () => Promise<void>;
  markAsRead: (id: string) => Promise<void>;
  markAllAsRead: () => Promise<void>;
  deleteNotification: (id: string) => Promise<void>;
  deleteNotificationsByType: (type: string) => Promise<void>;
  createNotification: (data: {
    userId: string;
    type?: string;
    title: string;
    message: string;
    documentId?: string;
  }) => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType>(
  {} as NotificationContextType
);

export function useNotifications() {
  return useContext(NotificationContext);
}

export function NotificationProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const { refreshCurrentUser } = useAuth();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [preferences, setPreferences] = useState<NotificationPreferences>({
    emailEnabled: true,
    browserEnabled: true,
    approvalsEnabled: true,
  });

  // Track known notification IDs so we only show browser popups for truly new ones
  const knownIdsRef = useRef<Set<string>>(new Set());
  const initialFetchDoneRef = useRef(false);

  const headers = useCallback(() => {
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [token]);

  // Fetch all notifications
  const fetchNotifications = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const res = await fetch(`${API_URL}/notifications`, {
        headers: headers(),
      });
      if (res.ok) {
        const data: Notification[] = await res.json();
        setNotifications(data);
        setUnreadCount(data.filter((n) => !n.isRead).length);

        // Show browser notifications for new unread items (skip on first load)
        if (initialFetchDoneRef.current && preferences.browserEnabled) {
          const newUnread = data.filter(
            (n) => !n.isRead && !knownIdsRef.current.has(n.id)
          );
          if (
            newUnread.length > 0 &&
            'Notification' in window &&
            Notification.permission === 'granted'
          ) {
            for (const n of newUnread) {
              new window.Notification(n.title, {
                body: n.message,
                icon: '/favicon.ico',
                tag: n.id,
              });
            }
          }
        }

        // Update known IDs
        knownIdsRef.current = new Set(data.map((n) => n.id));
        initialFetchDoneRef.current = true;

        // If there's a new assignment notification, trigger folders refresh
        const hasAssignment = data.some((n) => !n.isRead && (n.type === 'assignment' || /assigned to department/i.test(n.title)));
        if (hasAssignment) {
          // Refresh the current user's profile (in case department changed), then refresh folders
          try {
            await refreshCurrentUser?.();
          } catch (e) {
            // ignore
          }
          window.dispatchEvent(new Event('dms-folders-refresh'));
        }
      }
    } catch (err) {
      console.error('fetchNotifications error:', err);
    } finally {
      setLoading(false);
    }
  }, [token, headers, preferences.browserEnabled]);

  // Mark a single notification as read — immediate UI update
  const markAsRead = useCallback(
    async (id: string) => {
      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));

      try {
        const res = await fetch(`${API_URL}/notifications/${id}/read`, {
          method: 'PUT',
          headers: headers(),
        });
        if (!res.ok) {
          // Rollback on failure
          setNotifications((prev) =>
            prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
          );
          setUnreadCount((prev) => prev + 1);
        }
      } catch (err) {
        console.error('markAsRead error:', err);
        // Rollback
        setNotifications((prev) =>
          prev.map((n) => (n.id === id ? { ...n, isRead: false } : n))
        );
        setUnreadCount((prev) => prev + 1);
      }
    },
    [headers]
  );

  // Mark all as read
  const markAllAsRead = useCallback(async () => {
    const previousNotifications = [...notifications];
    const previousCount = unreadCount;

    // Optimistic update
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);

    try {
      const res = await fetch(`${API_URL}/notifications/read-all`, {
        method: 'PUT',
        headers: headers(),
      });
      if (!res.ok) {
        setNotifications(previousNotifications);
        setUnreadCount(previousCount);
      }
    } catch (err) {
      console.error('markAllAsRead error:', err);
      setNotifications(previousNotifications);
      setUnreadCount(previousCount);
    }
  }, [headers, notifications, unreadCount]);

  // Delete a single notification
  const deleteNotification = useCallback(
    async (id: string) => {
      const notificationToDelete = notifications.find((n) => n.id === id);
      const wasUnread = notificationToDelete && !notificationToDelete.isRead;

      // Optimistic update
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (wasUnread) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }

      try {
        const res = await fetch(`${API_URL}/notifications/${id}`, {
          method: 'DELETE',
          headers: headers(),
        });
        if (!res.ok) {
          // Rollback on failure
          if (notificationToDelete) {
            setNotifications((prev) => [...prev, notificationToDelete]);
            if (wasUnread) {
              setUnreadCount((prev) => prev + 1);
            }
          }
        }
      } catch (err) {
        console.error('deleteNotification error:', err);
        // Rollback
        if (notificationToDelete) {
          setNotifications((prev) => [...prev, notificationToDelete]);
          if (wasUnread) {
            setUnreadCount((prev) => prev + 1);
          }
        }
      }
    },
    [headers, notifications]
  );

  // Delete notifications by type
  const deleteNotificationsByType = useCallback(
    async (type: string) => {
      const notificationsToDelete = notifications.filter((n) => n.type === type);
      const unreadToDelete = notificationsToDelete.filter((n) => !n.isRead).length;

      // Optimistic update
      setNotifications((prev) => prev.filter((n) => n.type !== type));
      setUnreadCount((prev) => Math.max(0, prev - unreadToDelete));

      try {
        const res = await fetch(`${API_URL}/notifications/type/${type}`, {
          method: 'DELETE',
          headers: headers(),
        });
        if (!res.ok) {
          // Rollback on failure
          setNotifications((prev) => [...prev, ...notificationsToDelete]);
          setUnreadCount((prev) => prev + unreadToDelete);
        }
      } catch (err) {
        console.error('deleteNotificationsByType error:', err);
        // Rollback
        setNotifications((prev) => [...prev, ...notificationsToDelete]);
        setUnreadCount((prev) => prev + unreadToDelete);
      }
    },
    [headers, notifications]
  );

  // Create a notification
  const createNotification = useCallback(
    async (data: {
      userId: string;
      type?: string;
      title: string;
      message: string;
      documentId?: string;
    }) => {
      try {
        const res = await fetch(`${API_URL}/notifications`, {
          method: 'POST',
          headers: headers(),
          body: JSON.stringify(data),
        });
        if (res.ok) {
          // Re-fetch to stay in sync
          await fetchNotifications();
        }
      } catch (err) {
        console.error('createNotification error:', err);
      }
    },
    [headers, fetchNotifications]
  );

  // Fetch notification preferences
  const fetchPreferences = useCallback(async () => {
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/notifications/preferences`, {
        headers: headers(),
      });
      if (res.ok) {
        const data = await res.json();
        setPreferences({
          emailEnabled: data.emailEnabled,
          browserEnabled: data.browserEnabled,
          approvalsEnabled: data.approvalsEnabled,
        });
      }
    } catch (err) {
      console.error('fetchPreferences error:', err);
    }
  }, [token, headers]);

  // Auto-fetch when user logs in
  useEffect(() => {
    if (token && user) {
      fetchNotifications();
      fetchPreferences();
    } else {
      setNotifications([]);
      setUnreadCount(0);
      knownIdsRef.current = new Set();
      initialFetchDoneRef.current = false;
    }
  }, [token, user, fetchNotifications, fetchPreferences]);

  // Poll every 30 seconds for new notifications
  useEffect(() => {
    if (!token || !user) return;
    const interval = setInterval(fetchNotifications, 30000);
    return () => clearInterval(interval);
  }, [token, user, fetchNotifications]);

  return (
    <NotificationContext.Provider
      value={{
        notifications,
        unreadCount,
        loading,
        preferences,
        fetchNotifications,
        markAsRead,
        markAllAsRead,
        deleteNotification,
        deleteNotificationsByType,
        createNotification,
      }}
    >
      {children}
    </NotificationContext.Provider>
  );
}
