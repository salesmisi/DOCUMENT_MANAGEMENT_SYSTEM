import { User } from '../context/AuthContext';
import { Document,  ActivityLog } from '../context/DocumentContext';
import { Folder } from '../context/DocumentContext';

export const mockUsers: (User & { password: string })[] = [];

export const mockFolders: Folder[] = [];

export const mockDocuments: Document[] = [];

export const mockActivityLogs: ActivityLog[] = [];

export const mockDepartments = [];

