const fields = [
  ['title', '教材名称', '例如：数学 必修第一册'],
  ['subject', '学科', '例如：数学'],
  ['publisher', '出版社', '选填'],
  ['version', '数据版本', 'v1.1'],
  ['courseId', '课程 ID', '选填'],
  ['textbookId', '教材 ID', '选填'],
] as const;
type Field = (typeof fields)[number][0];
export function MetadataFields({
  value,
  onChange,
}: {
  value: Record<Field, string>;
  onChange: (patch: Partial<Record<Field, string>>) => void;
}) {
  return (
    <div className="form-grid">
      {fields.map(([key, label, placeholder]) => (
        <label className="field" key={key}>
          {label}
          {(key === 'title' || key === 'subject') && <span className="required">*</span>}
          <input
            aria-label={label}
            required={key === 'title' || key === 'subject'}
            maxLength={key === 'title' || key === 'publisher' ? 300 : 100}
            value={value[key]}
            placeholder={placeholder}
            onChange={(e) => onChange({ [key]: e.target.value })}
          />
        </label>
      ))}
    </div>
  );
}
