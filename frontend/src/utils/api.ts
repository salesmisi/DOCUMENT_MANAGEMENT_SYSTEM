const trimTrailingSlash = (value: string) => value.replace(/\/+$/, '');

const configuredApiBase = typeof import.meta !== 'undefined' && import.meta.env.VITE_API_URL
  ? String(import.meta.env.VITE_API_URL)
  : '';

export const API_BASE_URL = trimTrailingSlash(
  configuredApiBase || `${window.location.origin}/api`
);

export const API_ROOT_URL = API_BASE_URL.replace(/\/api$/, '');

export const apiUrl = (path: string) => {
  if (!path) {
    return API_BASE_URL;
  }
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_BASE_URL}${normalizedPath}`;
};

export const assetUrl = (path?: string | null) => {
  if (!path) return '';
  if (/^https?:\/\//i.test(path)) return path;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${API_ROOT_URL}${normalizedPath}`;
};