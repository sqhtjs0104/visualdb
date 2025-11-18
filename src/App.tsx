import React from 'react';
import { Scene3D } from './components/Scene3D';
import { SchemaInputPanel } from './components/SchemaInputPanel';
import { ModelInfoPanel } from './components/ModelInfoPanel';
import { mockGraph } from './mockData';
import { SchemaGraph, Table, Relation } from './types';
import { TableSchemaEditor } from './components/TableSchemaEditor';

function serializeGraph(graph: SchemaGraph) {
  return JSON.stringify(graph, null, 2);
}

function attachColumnForeignKeys(table: Table, relations: Relation[]) {
  const related = relations.filter(
    (rel) => rel.fromTable === table.name && rel.fromColumns.length === 1 && rel.toColumns.length === 1
  );

  return {
    ...table,
    columns: table.columns.map((column) => {
      const match = related.find((rel) => rel.fromColumns[0] === column.name);
      if (!match) return column;
      return {
        ...column,
        foreignKey: {
          table: match.toTable,
          column: match.toColumns[0],
        },
      };
    }),
  };
}

export default function App() {
  const [graph, setGraph] = React.useState<SchemaGraph>(mockGraph);
  const [inputValue, setInputValue] = React.useState<string>(serializeGraph(mockGraph));
  const [activeTable, setActiveTable] = React.useState<string | undefined>();
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTable, setDraftTable] = React.useState<Table | null>(null);

  const selectedTable = React.useMemo(() => graph.tables.find((t) => t.name === activeTable), [activeTable, graph.tables]);

  React.useEffect(() => {
    if (!selectedTable) {
      setDraftTable(null);
      setIsEditing(false);
      return;
    }
    setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
    setIsEditing(false);
  }, [graph.relations, selectedTable]);

  const handleGraphChange = (next: SchemaGraph, options?: { preserveActive?: boolean }) => {
    setGraph(next);
    setInputValue(serializeGraph(next));
    if (!options?.preserveActive) {
      setActiveTable(undefined);
    }
  };

  const handleDraftChange = (next: Table) => {
    setDraftTable(next);
  };

  const handleCancelEdit = () => {
    if (selectedTable) {
      setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
    }
    setIsEditing(false);
  };

  const buildRelationsFromColumns = (table: Table): Relation[] => {
    const existingRelations = graph.relations.filter((rel) => rel.fromTable === table.name);
    return table.columns.flatMap((column) => {
      if (!column.foreignKey) return [];
      const match = existingRelations.find((rel) => rel.fromColumns[0] === column.name);
      return [
        {
          name: match?.name ?? `fk_${table.name}_${column.name}`,
          fromTable: table.name,
          fromColumns: [column.name],
          toTable: column.foreignKey.table,
          toColumns: [column.foreignKey.column],
          onDelete: match?.onDelete,
          onUpdate: match?.onUpdate,
        },
      ];
    });
  };

  const handleSaveDraft = () => {
    if (!draftTable) return;

    const updatedRelations = buildRelationsFromColumns(draftTable);
    const updatedTable: Table = {
      ...draftTable,
      relations: updatedRelations,
      primaryKey: draftTable.columns.filter((col) => col.isPrimary).map((col) => col.name),
    };

    const nextTables = graph.tables.map((table) => (table.name === updatedTable.name ? updatedTable : table));
    const preservedRelations = graph.relations.filter((rel) => rel.fromTable !== updatedTable.name);
    const nextGraph = {
      ...graph,
      tables: nextTables,
      relations: [...preservedRelations, ...updatedRelations],
    };

    handleGraphChange(nextGraph, { preserveActive: true });
    setIsEditing(false);
  };

  const hydratedSelectedTable = selectedTable ? attachColumnForeignKeys(selectedTable, graph.relations) : undefined;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <h1>VisualDB 베이스</h1>
        <p>Schema 입력, mock 데이터, 그리고 R3F 기반 박스/관계 렌더링이 준비되어 있습니다.</p>
        <h2>Schema JSON</h2>
        <SchemaInputPanel value={inputValue} onChange={setInputValue} onSubmit={handleGraphChange} />
        <h2>Model 정보</h2>
        <ModelInfoPanel table={graph.tables.find((t) => t.name === activeTable)} />
      </aside>

      <main className="main-panel">
        <Scene3D graph={graph} activeTable={activeTable} onSelect={setActiveTable} />
        <div className="overlay-panel">
          <div className="title" style={{ marginBottom: 8 }}>
            <span>테이블 선택</span>
            <span className="badge">{graph.tables.length} tables</span>
          </div>
          <div className="overlay-content">
            <div className="table-list">
              {graph.tables.map((table) => (
                <button
                  type="button"
                  key={table.name}
                  className={`table-pill ${activeTable === table.name ? 'active' : ''}`}
                  onClick={() => setActiveTable(table.name)}
                >
                  <span>{table.name}</span>
                  <span className="badge">{table.columns.length} cols</span>
                </button>
              ))}
            </div>
            <div className="schema-panel">
              <div className="schema-panel__header">
                <div>
                  <div className="label">선택된 테이블</div>
                  <div className="schema-panel__title">
                    {hydratedSelectedTable ? hydratedSelectedTable.name : '테이블을 선택하세요'}
                  </div>
                </div>
                {hydratedSelectedTable && (
                  <div className="schema-panel__actions">
                    <span className="badge">{hydratedSelectedTable.columns.length} cols</span>
                    {!isEditing ? (
                      <button type="button" className="small-button" onClick={() => setIsEditing(true)}>
                        편집
                      </button>
                    ) : (
                      <div className="edit-action-group">
                        <button type="button" className="small-button" onClick={handleSaveDraft}>
                          저장
                        </button>
                        <button type="button" className="ghost-button" onClick={handleCancelEdit}>
                          취소
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {hydratedSelectedTable ? (
                isEditing && draftTable ? (
                  <TableSchemaEditor table={draftTable} tables={graph.tables} onChange={handleDraftChange} />
                ) : (
                  <div className="schema-panel__table">
                    <div className="schema-table__header schema-table__header--editable">
                      <span>컬럼</span>
                      <span>타입</span>
                      <span>Nullable</span>
                      <span>PK</span>
                      <span>Unique</span>
                      <span>Indexed</span>
                      <span>FK</span>
                    </div>
                    <div className="schema-table__body">
                      {hydratedSelectedTable.columns.map((column) => (
                        <div key={column.name} className="schema-table__row">
                          <span>{column.name}</span>
                          <span>{column.type}</span>
                          <span>{column.nullable ? 'YES' : 'NO'}</span>
                          <span>{column.isPrimary ? '●' : '–'}</span>
                          <span>{column.isUnique ? '●' : '–'}</span>
                          <span>{column.isIndexed ? '●' : '–'}</span>
                          <span>{column.foreignKey ? `${column.foreignKey.table}.${column.foreignKey.column}` : '–'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )
              ) : (
                <div className="schema-panel__empty">박스나 목록에서 테이블을 선택하면 스키마가 표시됩니다.</div>
              )}
            </div>
          </div>
        </div>
        <div className="scene-footer">Orbit: 드래그 · Zoom: 휠 · Pan: 우클릭</div>
      </main>
    </div>
  );
}
