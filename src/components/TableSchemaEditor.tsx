import React from 'react';
import { Column, Table } from '../types';

interface Props {
  table: Table;
  tables: Table[];
  onChange: (next: Table) => void;
}

const buildPrimaryKeys = (columns: Column[]) => columns.filter((col) => col.isPrimary).map((col) => col.name);

const updateTableColumns = (table: Table, columns: Column[]): Table => ({
  ...table,
  columns,
  primaryKey: buildPrimaryKeys(columns),
});

const fkActionOptions = ['CASCADE', 'SET NULL', 'NO ACTION', 'SET DEFAULT', 'RESTRICT'];

export function TableSchemaEditor({ table, tables, onChange }: Props) {
  const handleColumnChange = (index: number, nextColumn: Column) => {
    const nextColumns = table.columns.map((col, i) => (i === index ? nextColumn : col));
    onChange(updateTableColumns(table, nextColumns));
  };

  const handleToggle = (index: number, key: keyof Pick<Column, 'nullable' | 'isPrimary' | 'isUnique' | 'isIndexed'>) => {
    const target = table.columns[index];
    handleColumnChange(index, { ...target, [key]: !target[key] });
  };

  const handleFkChange = (index: number, value: string) => {
    if (!value) {
      handleColumnChange(index, { ...table.columns[index], foreignKey: undefined });
      return;
    }
    const previous = table.columns[index].foreignKey;
    const [fkTable, fkColumn] = value.split('.');
    handleColumnChange(index, {
      ...table.columns[index],
      foreignKey: {
        table: fkTable,
        column: fkColumn,
        onDelete: previous?.onDelete,
        onUpdate: previous?.onUpdate,
      },
    });
  };

  const handleFkActionChange = (index: number, key: 'onUpdate' | 'onDelete', value: string) => {
    const target = table.columns[index];
    if (!target.foreignKey) return;
    const nextForeignKey = {
      ...target.foreignKey,
      [key]: value || undefined,
    };
    handleColumnChange(index, { ...target, foreignKey: nextForeignKey });
  };

  const addColumn = () => {
    const baseName = `column_${table.columns.length + 1}`;
    const nextColumn: Column = {
      name: baseName,
      type: 'string',
      nullable: true,
      isPrimary: false,
      isUnique: false,
      isIndexed: false,
    };
    onChange(updateTableColumns(table, [...table.columns, nextColumn]));
  };

  const fkOptions = React.useMemo(
    () =>
      tables
        .filter((candidate) => candidate.name !== table.name)
        .flatMap((candidate) => candidate.columns.map((col) => `${candidate.name}.${col.name}`)),
    [table.name, tables]
  );

  return (
    <div className="schema-panel__table">
      <div className="schema-table__header schema-table__header--editable">
        <span style={{ width: '80px', }}>컬럼</span>
        <span style={{ width: '80px', }}>타입</span>
        <span style={{ width: '30px', }}>Nullable</span>
        <span style={{ width: '30px', }}>PK</span>
        <span style={{ width: '30px', }}>Unique</span>
        <span style={{ width: '30px', }}>Indexed</span>
        <span style={{ width: '100px', }}>FK 대상</span>
        <span style={{ width: '100px', }}>on Update</span>
        <span style={{ width: '100px', }}>on Delete</span>
      </div>
      <div className="schema-table__body">
        {table.columns.map((column, index) => (
          <div key={column.name} className="schema-table__row schema-table__row--editable">
            <input
              className="text-input"
              style={{ width: '80px', }}
              value={column.name}
              onChange={(e) => handleColumnChange(index, { ...column, name: e.target.value })}
            />
            <input
              className="text-input"
              style={{ width: '80px', }}
              value={column.type}
              onChange={(e) => handleColumnChange(index, { ...column, type: e.target.value })}
            />
            <label className="checkbox" style={{ width: '30px', }}>
              <input type="checkbox" checked={column.nullable} onChange={() => handleToggle(index, 'nullable')} />
              <span />
            </label>
            <label className="checkbox" style={{ width: '30px', }}>
              <input type="checkbox" checked={!!column.isPrimary} onChange={() => handleToggle(index, 'isPrimary')} />
              <span />
            </label>
            <label className="checkbox" style={{ width: '30px', }}>
              <input type="checkbox" checked={!!column.isUnique} onChange={() => handleToggle(index, 'isUnique')} />
              <span />
            </label>
            <label className="checkbox" style={{ width: '30px', }}>
              <input type="checkbox" checked={!!column.isIndexed} onChange={() => handleToggle(index, 'isIndexed')} />
              <span />
            </label>
            <select
              className="select-input"
              style={{ width: '100px', }}
              value={column.foreignKey ? `${column.foreignKey.table}.${column.foreignKey.column}` : ''}
              onChange={(e) => handleFkChange(index, e.target.value)}
            >
              <option value="">선택 없음</option>
              {fkOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="select-input"
              style={{ width: '100px', }}
              value={column.foreignKey?.onUpdate ?? ''}
              disabled={!column.foreignKey}
              onChange={(e) => handleFkActionChange(index, 'onUpdate', e.target.value)}
            >
              <option value="">선택 없음</option>
              {fkActionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
            <select
              className="select-input"
              style={{ width: '100px', }}
              value={column.foreignKey?.onDelete ?? ''}
              disabled={!column.foreignKey}
              onChange={(e) => handleFkActionChange(index, 'onDelete', e.target.value)}
            >
              <option value="">선택 없음</option>
              {fkActionOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>
        ))}
      </div>
      <div className="editor-actions">
        <button type="button" className="ghost-button" onClick={addColumn}>
          + 컬럼 추가
        </button>
      </div>
    </div>
  );
}
