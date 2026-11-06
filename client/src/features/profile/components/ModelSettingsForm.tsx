import { Button } from '@/components/ui/button';
import { ErrorNote, Loading } from '@/components/common';
import { useModelSettings } from '../hooks/useModelSettings';
import type { ModelScope } from '../model/configuration';
export function ModelSettingsForm({ scope }: { scope: ModelScope }) {
  const m = useModelSettings(scope),
    c = m.config;
  if (!c)
    return (
      <>
        <ErrorNote>{m.resource.error}</ErrorNote>
        <Loading />
      </>
    );
  return (
    <section className="panel">
      <h2>{scope === 'assistant' ? '助手模型服务' : '题库模型服务'}</h2>
      <div className="form-grid">
        <label className="field">
          接口协议
          <select
            value={c.protocol}
            onChange={(e) =>
              m.setConfig({
                ...c,
                protocol: e.target.value as typeof c.protocol,
                prefixCache: false,
              })
            }
          >
            <option value="chat">OpenAI 兼容 · Chat Completions</option>
            <option value="responses">OpenAI / 方舟 · Responses</option>
            <option value="anthropic">Anthropic · Messages</option>
          </select>
        </label>
        <label className="field">
          API 基础地址
          <input
            value={c.baseUrl}
            placeholder="https://服务地址/v1"
            onChange={(e) => m.setConfig({ ...c, baseUrl: e.target.value })}
          />
        </label>
        <label className="field">
          API Key
          <input
            type="password"
            autoComplete="new-password"
            value={c.apiKey || ''}
            placeholder={c.hasApiKey ? '已保存，留空保留当前密钥' : '输入密钥'}
            onChange={(e) => m.setConfig({ ...c, apiKey: e.target.value })}
          />
        </label>
        <label className="field">
          推理／对话模型
          <input value={c.model} onChange={(e) => m.setConfig({ ...c, model: e.target.value })} />
        </label>
        <label className="field">
          识图模型
          <input
            value={c.visionModel}
            placeholder="留空使用同一模型（需支持图片）"
            onChange={(e) => m.setConfig({ ...c, visionModel: e.target.value })}
          />
        </label>
      </div>
      {c.protocol === 'responses' && (
        <label>
          <input
            type="checkbox"
            checked={c.prefixCache}
            onChange={(e) => m.setConfig({ ...c, prefixCache: e.target.checked })}
          />{' '}
          启用方舟显式前缀缓存（仅兼容服务）
        </label>
      )}
      <ErrorNote>{m.action.error}</ErrorNote>
      <p role="status">{m.notice}</p>
      <div className="review-actions">
        <Button disabled={m.action.busy} onClick={m.save}>
          保存配置
        </Button>
        <Button variant="outline" disabled={m.action.busy} onClick={m.test}>
          测试连通性
        </Button>
      </div>
    </section>
  );
}
