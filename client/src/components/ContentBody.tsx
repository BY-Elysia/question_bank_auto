import { lazy, Suspense } from 'react';
import type { Content, Question } from '@/lib/api';
const MathText = lazy(() => import('./RichText'));
function RichText({ text }: { text: string }) {
  return (
    <Suspense fallback={<p>{text}</p>}>
      <MathText text={text} />
    </Suspense>
  );
}
function QuestionBody({ question }: { question: Question }) {
  return (
    <>
      <RichText text={question.prompt} />
      {question.options.length > 0 && (
        <div className="question-options">
          {question.options.map((o, i) => (
            <div key={i}>
              <b>{o.id}</b>
              <RichText text={o.text} />
            </div>
          ))}
        </div>
      )}
      {question.answer && (
        <div className="answer-block">
          <span>
            {question.answer.origin === 'ai_generated'
              ? 'AI 答案'
              : question.answer.origin === 'human'
                ? '人工答案'
                : '原文答案'}{' '}
            · {question.answer.review === 'accepted' ? '已确认' : '待确认'}
          </span>
          <RichText text={question.answer.text} />
          {question.answer.explanation && <RichText text={question.answer.explanation} />}
        </div>
      )}
      {question.children.map((c, i) => (
        <div className="subquestion" key={i}>
          <strong>({c.label || i + 1})</strong>
          <QuestionBody question={{ ...c, children: [] }} />
        </div>
      ))}
    </>
  );
}
export function ContentBody({ content }: { content: Content }) {
  return (
    <div className="content-body">
      {content.question ? (
        <QuestionBody question={content.question} />
      ) : (
        <RichText text={content.text} />
      )}{' '}
      {content.table && (
        <div className="table-scroll">
          <table>
            <tbody>
              {content.table.map((row, i) => (
                <tr key={i}>
                  {row.map((cell, j) => (
                    <td key={j}>
                      <RichText text={cell} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {content.caption && <p className="caption">{content.caption}</p>}
    </div>
  );
}
