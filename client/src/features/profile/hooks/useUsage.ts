import { useResource } from '@/shared/hooks/useAsync';
import { profileApi } from '../api/profile';
export function useUsage() {
  return useResource(profileApi.usage, 15000);
}
