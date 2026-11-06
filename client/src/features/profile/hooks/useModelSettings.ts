import { useState, useEffect, useRef, useMemo } from 'react';
import { useAction, useResource } from '@/shared/hooks/useAsync';
import { modelSettingsApi, type ModelScope, type ModelConfig } from '../api/profile';
export function useModelSettings(scope: ModelScope) {
  const api = useMemo(() => modelSettingsApi(scope), [scope]);
  const resource = useResource(api.get),
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
      const saved = await api.save(config);
      dirty.current = false;
      setConfig({ ...saved, apiKey: '' });
      setNotice('模型配置已保存');
      window.dispatchEvent(new Event('model-configured'));
    });
  const test = () =>
    action.run(async () => {
      if (!config) return;
      setNotice('正在测试连接…');
      const result = await api.test(config);
      setNotice(
        result.ok ? `连接成功 · ${result.durationMs} ms · ${result.reply || ''}` : result.message!,
      );
    });
  return { config, setConfig: editConfig, notice, save, test, action, resource };
}
