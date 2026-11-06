import { AlertCircle, Check, LoaderCircle, Sparkles } from 'lucide-react';
import type { ReactNode } from 'react';
import { statusLabels } from '@/lib/labels';
export function Status({ status }: { status: string }) {
  return (
    <span className={`status status-${status}`}>
      <span />
      {statusLabels[status] ?? status}
    </span>
  );
}
export function ErrorNote({ children }: { children: ReactNode }) {
  return children ? (
    <div className="error-note" role="alert">
      <AlertCircle size={16} />
      <span>{children}</span>
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="loading-state" role="status">
      <LoaderCircle className="spin" />
      正在载入工作区…
    </div>
  );
}
export function Logo() {
  return (
    <div className="brand">
      <span className="brand-mark">
        <i />
        <i />
        <i />
      </span>
      <div>
        析页 <span>WORKSPACE</span>
      </div>
    </div>
  );
}
export function Empty({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="empty-state">
      <Sparkles size={24} />
      <h3>{title}</h3>
      <p>{children}</p>
    </div>
  );
}
export function Steps({ step }: { step: number }) {
  return (
    <div className="steps">
      {['准备材料', '提取设置', '智能提取', '校对与导出'].map((label, i) => (
        <div key={label} className={i === step ? 'current' : i < step ? 'done' : ''}>
          <span>{i < step ? <Check size={12} /> : String(i + 1).padStart(2, '0')}</span>
          {label}
          {i < 3 && <i />}
        </div>
      ))}
    </div>
  );
}
