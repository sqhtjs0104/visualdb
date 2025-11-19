import React from 'react';
import { Relation, Table } from '../types';

interface Props {
  table?: Table;
  relations?: Relation[];
}

export function ModelInfoPanel({ table, relations = [] }: Props) {
  if (!table) {
    return <div className="model-info">테이블을 선택하면 상세 정보가 표시됩니다.</div>;
  }

  return (
    <div className="model-info">
      <div className="title">
        <span>{table.name}</span>
        <span className="pill">{table.domain}</span>
      </div>
      {table.comment && <div>{table.comment}</div>}
      <div>
        <strong>PK:</strong> {table.primaryKey.join(', ')}
      </div>
      <div>
        <strong>Columns</strong>
        <ul>
          {table.columns.map((col) => (
            <li key={col.name}>
              {col.name} — {col.type}
              {!col.nullable && ' (NOT NULL)'}
              {col.isPrimary && ' · PK'}
              {col.isUnique && ' · UNIQUE'}
              {col.isIndexed && ' · IDX'}
            </li>
          ))}
        </ul>
      </div>
      <div>
        <strong>Relations (FK)</strong>
        <ul>
          {relations.length === 0 && <li>없음</li>}
          {relations.map((rel) => (
            <li key={rel.name}>
              {rel.name}: {rel.fromColumns.join(', ')} → {rel.toTable}.{rel.toColumns.join(', ')}{' '}
              {rel.onUpdate && `(onUpdate: ${rel.onUpdate}) `}
              {rel.onDelete && `(onDelete: ${rel.onDelete})`}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
