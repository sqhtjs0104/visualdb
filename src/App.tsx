import React from 'react';
import { Scene3D } from './components/Scene3D';
import { SchemaInputPanel } from './components/SchemaInputPanel';
import { mockGraph } from './mockData';
import { SchemaGraph, Table, Relation } from './types';
import { TableSchemaEditor } from './components/TableSchemaEditor';

const SCHEMA_ENDPOINT = '/schema.json';

function serializeGraph(graph: SchemaGraph) {
  return JSON.stringify(graph, null, 2);
}

async function persistSchemaToFile(graph: SchemaGraph) {
  try {
    await fetch(SCHEMA_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: serializeGraph(graph),
    });
  } catch (error) {
    console.error('Failed to write schema.json', error);
  }
}

async function loadSchemaFromFile(): Promise<SchemaGraph | null> {
  try {
    const response = await fetch(`${SCHEMA_ENDPOINT}?t=${Date.now()}`, { cache: 'no-store' });
    if (!response.ok) return null;
    const raw = await response.text();
    const parsed = JSON.parse(raw) as SchemaGraph;
    if (!parsed.tables || !parsed.relations) return null;
    return parsed;
  } catch (error) {
    console.error('Failed to read schema.json', error);
    return null;
  }
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
          onDelete: match.onDelete,
          onUpdate: match.onUpdate,
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
  const [isSchemaModalOpen, setIsSchemaModalOpen] = React.useState(false);

  const selectedTable = React.useMemo(() => graph.tables.find((t) => t.name === activeTable), [activeTable, graph.tables]);

  const handleGraphChange = React.useCallback(
    (next: SchemaGraph, options?: { preserveActive?: boolean; skipPersist?: boolean }) => {
      setGraph(next);
      setInputValue(serializeGraph(next));
      if (!options?.preserveActive) {
        setActiveTable(undefined);
      }
      if (!options?.skipPersist) {
        void persistSchemaToFile(next);
      }
    },
    []
  );

  React.useEffect(() => {
    if (!selectedTable) {
      setDraftTable(null);
      setIsEditing(false);
      return;
    }
    setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
    setIsEditing(false);
  }, [graph.relations, selectedTable]);

  React.useEffect(() => {
    const bootstrapFromFile = async () => {
      const loaded = await loadSchemaFromFile();
      if (!loaded) return;
      handleGraphChange(loaded, { preserveActive: true, skipPersist: true });
    };

    void bootstrapFromFile();
  }, [handleGraphChange]);

  const handleDraftChange = (next: Table) => {
    setDraftTable(next);
  };

  const handleSchemaFileLoad = (next: SchemaGraph, raw: string) => {
    setInputValue(raw);
    handleGraphChange(next);
  };

  const handleExportSchema = () => {
    const blob = new Blob([serializeGraph(graph)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schema.json';
    link.click();
    URL.revokeObjectURL(url);
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
          onDelete: column.foreignKey.onDelete ?? match?.onDelete,
          onUpdate: column.foreignKey.onUpdate ?? match?.onUpdate,
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
      <div className="settings-button__wrapper">
        <button
          type="button"
          className="icon-button"
          aria-label="Schema JSON 설정"
          onClick={() => setIsSchemaModalOpen(true)}
        >
          ⚙️
        </button>
      </div>
      <main className="main-panel">
        <Scene3D graph={graph} activeTable={activeTable} onSelect={setActiveTable} />
        <div className="overlay-panel">
          <div className="title" style={{ marginBottom: 12 }}>
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
                  {/* <div className="label">선택된 테이블</div> */}
                  <div className="schema-panel__title">
                    {hydratedSelectedTable ? hydratedSelectedTable.name : '테이블을 선택하세요'}
                  </div>
                  {hydratedSelectedTable?.comment && (
                    <div className="schema-panel__comment">{hydratedSelectedTable.comment}</div>
                  )}
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
                      <span style={{ width: '50px', }}>컬럼</span>
                      <span style={{ width: '70px', }}>타입</span>
                      <span style={{ width: '40px', }}>Nullable</span>
                      <span style={{ width: '40px', }}>PK</span>
                      <span style={{ width: '40px', }}>Unique</span>
                      <span style={{ width: '40px', }}>Indexed</span>
                      <span style={{ width: '70px', }}>FK</span>
                      <span style={{ width: '60px', }}>on Update</span>
                      <span style={{ width: '60px', }}>on Delete</span>
                    </div>
                    <div className="schema-table__body">
                      {hydratedSelectedTable.columns.map((column) => (
                        <div key={column.name} className="schema-table__row">
                          <span style={{ width: '50px', }}>{column.name}</span>
                          <span style={{ width: '70px', }}>{column.type}</span>
                          <span style={{ width: '40px', }}>{column.nullable ? 'YES' : 'NO'}</span>
                          <span style={{ width: '40px', }}>{column.isPrimary ? '●' : '–'}</span>
                          <span style={{ width: '40px', }}>{column.isUnique ? '●' : '–'}</span>
                          <span style={{ width: '40px', }}>{column.isIndexed ? '●' : '–'}</span>
                          <span style={{ width: '70px', }}>{column.foreignKey ? `${column.foreignKey.table}.${column.foreignKey.column}` : '–'}</span>
                          <span style={{ width: '60px', }}>{column.foreignKey?.onUpdate ?? '–'}</span>
                          <span style={{ width: '60px', }}>{column.foreignKey?.onDelete ?? '–'}</span>
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
      {isSchemaModalOpen && (
        <div className="modal-backdrop" onClick={() => setIsSchemaModalOpen(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal__header">
              <div>
                <div className="label">Schema JSON</div>
                <div className="schema-panel__title">스키마 설정</div>
              </div>
              <button type="button" className="icon-button" aria-label="닫기" onClick={() => setIsSchemaModalOpen(false)}>
                ✕
              </button>
            </div>
            <SchemaInputPanel
              value={inputValue}
              onChange={setInputValue}
              onSubmit={handleGraphChange}
              onLoadFromFile={handleSchemaFileLoad}
              onExport={handleExportSchema}
            />
          </div>
        </div>
      )}
    </div>
  );
}
