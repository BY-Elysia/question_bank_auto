import { request, write } from '@/shared/api/http';
export const accessApi = {
  session: () => request<{ enabled: boolean; authenticated: boolean }>('/access/session'),
  login: (username: string, password: string) => write('/access/login', { username, password }),
  logout: () => write('/access/logout'),
};
