import { useState, useEffect, useRef } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { profileApi, type ModelConfig } from '../api/profile';
export function useProfile() {
  const resource = useResource(profileApi.get),
    usage = useResource(profileApi.usage, 15000),
    action = useAction();
  const [config, setConfig] = useState<ModelConfig | null>(null),
    [notice, setNotice] = useState('');
  const dirty = useRef(false);
  const editConfig: typeof setConfig = (value) => {
    dirty.current = true;
    setConfig(value);
  };
  useEffect(() => {
    if (resource.data && !dirty.current) setConfig({ ...resource.data, apiKey: '' });
  }, [resource.data]);
  const save = () =>
    action.run(async () => {
      if (!config) return;
      const saved = await profileApi.save(config);
      dirty.current = false;
      setConfig({ ...saved, apiKey: '' });
      setNotice('模型配置已保存');
      window.dispatchEvent(new Event('model-configured'));
    });
  const test = () =>
    action.run(async () => {
      if (!config) return;
      setNotice('正在测试连接…');
      const result = await profileApi.test(config);
      setNotice(
        result.ok ? `连接成功 · ${result.durationMs} ms · ${result.reply || ''}` : result.message!,
      );
    });
  return { config, setConfig: editConfig, notice, save, test, action, resource, usage };
}
