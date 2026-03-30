import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

export type LogoSize = 'small' | 'medium' | 'large';

export const LOGO_SIZES = {
  small: { width: 'w-24', height: 'h-12', label: 'Small (96x48)' },
  medium: { width: 'w-36', height: 'h-16', label: 'Medium (144x64)' },
  large: { width: 'w-48', height: 'h-20', label: 'Large (192x80)' },
};

interface LogoContextType {
  logo: string;
  logoSize: LogoSize;
  loading: boolean;
  refreshLogo: () => Promise<void>;
  updateLogo: (file: File) => Promise<boolean>;
  updateLogoSize: (size: LogoSize) => Promise<boolean>;
  resetLogo: () => Promise<boolean>;
}

const LogoContext = createContext<LogoContextType | undefined>(undefined);

const API_URL = 'http://localhost:5000/api';

export function LogoProvider({ children }: { children: React.ReactNode }) {
  const [logo, setLogo] = useState<string>('/maptechlogo.png');
  const [logoSize, setLogoSize] = useState<LogoSize>('medium');
  const [loading, setLoading] = useState(true);

  const fetchLogo = useCallback(async () => {
    try {
      const response = await fetch(`${API_URL}/settings/logo`);
      if (response.ok) {
        const data = await response.json();
        // Handle both uploaded logos and default logo
        if (data.logo.startsWith('/uploads/')) {
          setLogo(`http://localhost:5000${data.logo}`);
        } else {
          setLogo(data.logo);
        }
        // Set logo size if provided
        if (data.size && ['small', 'medium', 'large'].includes(data.size)) {
          setLogoSize(data.size as LogoSize);
        }
      }
    } catch (error) {
      console.error('Error fetching logo:', error);
      setLogo('/maptechlogo.png');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchLogo();
  }, [fetchLogo]);

  const refreshLogo = async () => {
    setLoading(true);
    await fetchLogo();
  };

  const updateLogo = async (file: File): Promise<boolean> => {
    try {
      const token = localStorage.getItem('dms_token');
      const formData = new FormData();
      formData.append('logo', file);

      const response = await fetch(`${API_URL}/settings/logo`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        setLogo(`http://localhost:5000${data.logo}`);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating logo:', error);
      return false;
    }
  };

  const resetLogo = async (): Promise<boolean> => {
    try {
      const token = localStorage.getItem('dms_token');
      const response = await fetch(`${API_URL}/settings/logo/reset`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setLogo('/maptechlogo.png');
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error resetting logo:', error);
      return false;
    }
  };

  const updateLogoSize = async (size: LogoSize): Promise<boolean> => {
    try {
      const token = localStorage.getItem('dms_token');
      const response = await fetch(`${API_URL}/settings/logo/size`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ size }),
      });

      if (response.ok) {
        setLogoSize(size);
        return true;
      }
      return false;
    } catch (error) {
      console.error('Error updating logo size:', error);
      return false;
    }
  };

  return (
    <LogoContext.Provider value={{ logo, logoSize, loading, refreshLogo, updateLogo, updateLogoSize, resetLogo }}>
      {children}
    </LogoContext.Provider>
  );
}

export function useLogo() {
  const context = useContext(LogoContext);
  if (context === undefined) {
    throw new Error('useLogo must be used within a LogoProvider');
  }
  return context;
}