import React from 'react';
import { SchemaGraph } from '../types';

interface Props {
  value: string;
  onChange: (value: string) => void;
  onSubmit: (graph: SchemaGraph) => void;
  onLoadFromFile: (graph: SchemaGraph, raw: string) => void;
  onExport: () => void;
}

export function SchemaInputPanel({ value, onChange, onSubmit, onLoadFromFile, onExport }: Props) {
  const [error, setError] = React.useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

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

  const handleFileLoad = async (file?: File) => {
    if (!file) return;
    try {
      const raw = await file.text();
      const parsed = JSON.parse(raw) as SchemaGraph;
      if (!parsed.tables || !parsed.relations) {
        throw new Error('Graph payload must include tables and relations');
      }
      onLoadFromFile(parsed, raw);
      setError(null);
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    void handleFileLoad(file);
    event.target.value = '';
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
      <div className="schema-file-actions">
        <input
          ref={fileInputRef}
          type="file"
          accept="application/json"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <button type="button" onClick={() => fileInputRef.current?.click()}>
          JSON 파일 불러오기
        </button>
        <button type="button" className="ghost-button" onClick={onExport}>
          현재 스키마 저장
        </button>
      </div>
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
