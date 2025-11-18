import React from 'react';
import { SchemaGraph } from '../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (graph: SchemaGraph) => void;
}

export function SchemaInputPanel({ value, onChange, onSubmit }: Props) {
  const [error, setError] = React.useState<string | null>(null);

  const handleSubmit = () => {
    try {
      const parsed = JSON.parse(value) as SchemaGraph;
      if (!parsed.tables || !parsed.relations) {
        throw new Error('Graph payload must include tables and relations');
      }
      setError(null);
      onSubmit(parsed);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  return (
    <div className="input-group">
      <label htmlFor="schema-input">Schema 입력 / 설정 / 붙여넣기</label>
      <textarea
        id="schema-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Paste schema JSON here"
      />
      <button type="button" onClick={handleSubmit}>
        Apply schema JSON
      </button>
      {error && <div className="schema-error">❗ {error}</div>}
      <small>
        자유롭게 DTO를 붙여넣기 하거나 수정해 mock 데이터를 실험할 수 있습니다. 테이블 좌표는 layout.nodes[tableName]에
        지정하면 그대로 사용됩니다.
      </small>
    </div>
  );
}
