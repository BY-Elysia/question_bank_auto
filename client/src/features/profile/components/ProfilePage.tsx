import { ModelSettingsForm } from './ModelSettingsForm';
import type { ModelScope } from '../model/configuration';
import { UsagePanel } from './UsagePanel';
export default function ProfilePage({ scope = 'textbook' }: { scope?: ModelScope }) {
  return (
    <div className="workspace-page account-page">
      <h1>{scope === 'assistant' ? '助手模型设置' : '个人中心'}</h1>
      <p className="muted">题库与助手分别保存 API 地址、密钥和模型，互不影响。</p>
      <div className="review-actions">
        <button
          onClick={() =>
            (location.hash = scope === 'assistant' ? '/assistant' : '/assistant/settings')
          }
        >
          {scope === 'assistant' ? '返回对话' : '设置助手模型 →'}
        </button>
      </div>
      <ModelSettingsForm key={scope} scope={scope} />
      {scope === 'textbook' && <UsagePanel />}
    </div>
  );
}
