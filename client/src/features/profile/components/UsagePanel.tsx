import { ErrorNote } from '@/components/common';
import { useUsage } from '../hooks/useUsage';
import { navigate } from '@/shared/navigation';
export function UsagePanel() {
  const usage = useUsage();
  return (
    <section className="panel">
      <h2>Token 用量</h2>
      <p className="muted">
        按模型实际返回的 usage 统计，包含格式失败与重试调用；缓存命中 Token 已包含在输入量中。
      </p>
      <ErrorNote>{usage.error}</ErrorNote>
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
            {usage.data?.workspaces.map((w) => (
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
            {usage.data && (
              <tr>
                <td>AI 助手</td>
                <td>{usage.data.assistant.input}</td>
                <td>{usage.data.assistant.output}</td>
                <td>{usage.data.assistant.cached}</td>
                <td>{usage.data.assistant.total}</td>
                <td>{usage.data.assistant.calls}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
}
