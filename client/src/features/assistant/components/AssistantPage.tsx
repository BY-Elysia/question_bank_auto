import { useState } from 'react';
import { PanelLeftClose, PanelLeftOpen, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useAssistant } from '../hooks/useAssistant';
import { useKnowledge } from '../hooks/useKnowledge';
import { KnowledgePicker } from './KnowledgePicker';
import { ConversationHistory } from './ConversationHistory';
import { ConversationView } from './ConversationView';
export default function AssistantPage() {
  const m = useAssistant();
  const knowledge = useKnowledge(m.id, m.adopt, m.setDraft);
  const [history, setHistory] = useState(false);
  return (
    <div className={`assistant-page chat-workbench ${history ? 'history-open' : ''}`}>
      <ConversationHistory m={m} onSelect={() => setHistory(false)} />
      <section className="chat-main">
        <header className="chat-topbar">
          <div>
            <button
              className="chat-history-toggle"
              aria-label="切换对话历史"
              onClick={() => setHistory((v) => !v)}
            >
              {history ? <PanelLeftClose size={18} /> : <PanelLeftOpen size={18} />}
            </button>
            <h1>AI 助手</h1>
            <span className="chat-model-label">独立模型配置</span>
          </div>
          <KnowledgePicker model={knowledge} disabled={!!m.activeRun} />
          <Button variant="ghost" size="sm" onClick={() => (location.hash = '/assistant/settings')}>
            <Settings2 size={15} />
            模型设置
          </Button>
        </header>
        <ConversationView
          m={m}
          error={knowledge.action.error}
          sendBlocked={knowledge.action.busy}
        />
      </section>
    </div>
  );
}
