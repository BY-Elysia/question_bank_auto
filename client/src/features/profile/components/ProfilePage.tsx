import { Button } from '@/components/ui/button';
import { ErrorNote, Loading } from '@/components/common';
import { useProfile } from '../hooks/useProfile';
import { navigate } from '@/shared/navigation';
export default function ProfilePage() {
  const m = useProfile(),
    c = m.config;
  if (!c)
    return (
      <div className="workspace-page">
        <ErrorNote>{m.resource.error}</ErrorNote>
        <Loading />
      </div>
    );
  return (
    <div className="workspace-page account-page">
      <h1>个人中心</h1>
      <p className="muted">模型配置与用量记录</p>
      <section className="panel">
        <h2>模型服务</h2>
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
      <section className="panel">
        <h2>Token 用量</h2>
        <p className="muted">
          按模型实际返回的 usage 统计，包含格式失败与重试调用；缓存命中 Token 已包含在输入量中。
        </p>
        <ErrorNote>{m.usage.error}</ErrorNote>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>工作区</th>
                <th>输入</th>
                <th>输出</th>
                <th>缓存命中</th>
                <th>总量</th>
                <th>调用</th>
              </tr>
            </thead>
            <tbody>
              {m.usage.data?.workspaces.map((w) => (
                <tr key={w.id}>
                  <td>
                    <button onClick={() => navigate(w.id)}>{w.title}</button>
                  </td>
                  <td>{w.input.toLocaleString()}</td>
                  <td>{w.output.toLocaleString()}</td>
                  <td>{w.cached.toLocaleString()}</td>
                  <td>{w.total.toLocaleString()}</td>
                  <td>
                    {w.calls}
                    {w.unreported > 0 && `（${w.unreported} 次未报告用量）`}
                  </td>
                </tr>
              ))}
              {m.usage.data && (
                <tr>
                  <td>AI 助手</td>
                  <td>{m.usage.data.assistant.input}</td>
                  <td>{m.usage.data.assistant.output}</td>
                  <td>{m.usage.data.assistant.cached}</td>
                  <td>{m.usage.data.assistant.total}</td>
                  <td>{m.usage.data.assistant.calls}</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
