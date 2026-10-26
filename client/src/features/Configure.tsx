import { useState } from 'react';
import { ArrowRight, Layers3, ScanLine, ShieldCheck, LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ErrorNote } from '@/components/common';
import { ChapterGroups, type Group } from './ChapterGroups';
import { type WorkspaceView, type ExtractionSettings, write, workspaceUrl } from '@/lib/api';
import { useAction } from '@/lib/hooks';
export function Configure({ view, onDone }: { view: WorkspaceView; onDone: () => void }) {
  const [metadata, setMetadata] = useState({
    version: 'v1.1',
    courseId: '',
    textbookId: '',
    title: view.workspace.title,
    publisher: '',
    subject: '',
    hasAnswer: true,
    answerHandlingMode: 'generate_brief',
  });
  const [mode, setMode] = useState<'sequential' | 'chapters'>('sequential'),
    [groups, setGroups] = useState<Group[]>([
      { id: 1, pages: [] },
      { id: 2, pages: [] },
    ]),
    [instructions, setInstructions] = useState(''),
    [cache, setCache] = useState<'prefix' | 'off'>('prefix');
  const action = useAction();
  const grouped =
    groups.every((g) => g.pages.length > 0) &&
    new Set(groups.flatMap((g) => g.pages)).size === view.pages.length;
  const valid =
    metadata.title.trim() &&
    metadata.subject.trim() &&
    (mode === 'sequential' || grouped) &&
    view.actions.configure;
  async function start() {
    if (!valid) return;
    await action.run(async () => {
      await write(workspaceUrl(view.workspace.id) + '/extract', {
        metadata: {
          ...metadata,
          answerHandlingMode: metadata.hasAnswer ? 'extract_visible' : metadata.answerHandlingMode,
        },
        instructions,
        cache,
        mode,
        chapters: mode === 'chapters' ? groups.map((g) => ({ pages: g.pages })) : [],
        concurrency: 2,
      } as ExtractionSettings);
      onDone();
    });
  }
  return (
    <div className="configure">
      <div className="section-intro">
        <div className="soft-tag">
          <ShieldCheck size={14} />
          {view.pages.length} 张图片已就绪
        </div>
        <h2>开始前，再了解一下这本教材。</h2>
        <p>补充教材信息，选择提取方式。剩下的交给我们。</p>
      </div>
      <div className="config-grid">
        <section className="panel">
          <div className="panel-heading">
            <span className="step-number">01</span>
            <h3>教材信息</h3>
            <span>与原教材保持一致</span>
          </div>
          <div className="form-grid">
            {[
              ['title', '教材名称', '例如：数学 必修第一册'],
              ['subject', '学科', '例如：数学'],
              ['publisher', '出版社', '选填'],
              ['version', '数据版本', 'v1.1'],
              ['courseId', '课程 ID', '选填'],
              ['textbookId', '教材 ID', '选填'],
            ].map(([key, label, placeholder]) => (
              <label className="field" key={key}>
                {label}
                {['title', 'subject'].includes(key) && <span className="required">*</span>}
                <input
                  required={['title', 'subject'].includes(key)}
                  maxLength={['title', 'publisher'].includes(key) ? 300 : 100}
                  value={metadata[key as 'title']}
                  placeholder={placeholder}
                  onChange={(e) => setMetadata({ ...metadata, [key]: e.target.value })}
                />
              </label>
            ))}
          </div>
          <label className="field">
            补充提取要求
            <textarea
              rows={3}
              maxLength={8000}
              value={instructions}
              onChange={(e) => setInstructions(e.target.value)}
              placeholder="例如：保留例题的完整解题步骤，公式使用 LaTeX 表示"
            />
          </label>
        </section>
        <section className="panel">
          <div className="panel-heading">
            <span className="step-number">02</span>
            <h3>答案处理</h3>
          </div>
          <p className="muted">教材中是否包含原文答案？</p>
          <div className="segmented">
            {[
              [true, '包含答案'],
              [false, '不包含答案'],
            ].map(([value, label]) => (
              <button
                key={String(value)}
                aria-pressed={metadata.hasAnswer === value}
                className={metadata.hasAnswer === value ? 'selected' : ''}
                onClick={() => setMetadata({ ...metadata, hasAnswer: value as boolean })}
              >
                {label}
              </button>
            ))}
          </div>
          {metadata.hasAnswer ? (
            <div className="info-note">优先提取并匹配教材中的原文答案，保留来源。</div>
          ) : (
            <div className="radio-options">
              {[
                ['generate_brief', 'AI 补全答案', '生成答案及解题步骤，作为候选等待审核。'],
                ['leave_empty', '保持留空', '仅提取题目内容，答案留待后续处理。'],
              ].map(([value, title, note]) => (
                <label key={value}>
                  <input
                    type="radio"
                    name="answer"
                    checked={metadata.answerHandlingMode === value}
                    onChange={() => setMetadata({ ...metadata, answerHandlingMode: value })}
                  />
                  <div>
                    <strong>{title}</strong>
                    <p>{note}</p>
                  </div>
                </label>
              ))}
            </div>
          )}
          <div className="cache-setting">
            <label className="field">
              模型缓存
              <select value={cache} onChange={(e) => setCache(e.target.value as 'prefix' | 'off')}>
                <option value="prefix">前缀缓存 · 默认</option>
                <option value="off">关闭缓存 · 其他模型服务</option>
              </select>
            </label>
            <small>方舟 Responses 使用前缀缓存，复用固定指令。</small>
          </div>
        </section>
      </div>
      <section className="panel mode-panel">
        <div className="panel-heading">
          <span className="step-number">03</span>
          <h3>提取方式</h3>
        </div>
        <div className="mode-options">
          {[
            {
              id: 'sequential',
              title: '顺序提取',
              note: '按整本教材的页序处理，自动衔接跨页题目。',
              icon: ScanLine,
            },
            {
              id: 'chapters',
              title: '多章并行',
              note: '手动划分章节图片，每章独立处理，自动识别章名。',
              icon: Layers3,
            },
          ].map((m) => (
            <button
              className={mode === m.id ? 'selected' : ''}
              key={m.id}
              aria-pressed={mode === m.id}
              disabled={m.id === 'chapters' && view.pages.length < 2}
              onClick={() => setMode(m.id as typeof mode)}
            >
              <m.icon />
              <div>
                <strong>{m.title}</strong>
                <p>{m.note}</p>
              </div>
              <span className="radio-dot" />
            </button>
          ))}
        </div>
        {mode === 'chapters' && (
          <ChapterGroups pages={view.pages} groups={groups} onChange={setGroups} />
        )}
      </section>
      <ErrorNote>{action.error}</ErrorNote>
      <div className="config-footer">
        <span>
          {mode === 'chapters' && !grouped
            ? '请将全部图片分配到至少两个非空章节。'
            : '结果保留原图定位，所有 AI 补全内容均可审核。'}
        </span>
        <Button disabled={!valid || action.busy} onClick={start}>
          {action.busy ? <LoaderCircle className="spin" size={16} /> : <ScanLine size={16} />}
          开始提取
          <ArrowRight size={16} />
        </Button>
      </div>
    </div>
  );
}
