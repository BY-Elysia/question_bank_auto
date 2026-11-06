import { request, write } from '@/shared/api/http';
type Session = { enabled: boolean; authenticated: boolean };
declare global {
  interface Window {
    __sessionBootstrap?: Promise<Session | null>;
  }
}
export const accessApi = {
  session: async () => (await window.__sessionBootstrap) ?? request<Session>('/access/session'),
  login: (username: string, password: string) => write('/access/login', { username, password }),
  logout: () => {
    window.__sessionBootstrap = undefined;
    return write('/access/logout');
  },
};
