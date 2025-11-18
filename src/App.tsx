import React from 'react';
import { Scene3D } from './components/Scene3D';
import { SchemaInputPanel } from './components/SchemaInputPanel';
import { ModelInfoPanel } from './components/ModelInfoPanel';
import { mockGraph } from './mockData';
import { SchemaGraph } from './types';

function serializeGraph(graph: SchemaGraph) {
  return JSON.stringify(graph, null, 2);
}

export default function App() {
  const [graph, setGraph] = React.useState<SchemaGraph>(mockGraph);
  const [inputValue, setInputValue] = React.useState<string>(serializeGraph(mockGraph));
  const [activeTable, setActiveTable] = React.useState<string | undefined>();

  const selectedTable = React.useMemo(() => graph.tables.find((t) => t.name === activeTable), [activeTable, graph.tables]);

  const handleGraphChange = (next: SchemaGraph) => {
    setGraph(next);
    setActiveTable(undefined);
  };

  const fkLookup = React.useMemo(() => {
    if (!selectedTable) return {} as Record<string, string[]>;
    const outgoing = graph.relations.filter((rel) => rel.fromTable === selectedTable.name);
    return outgoing.reduce<Record<string, string[]>>((acc, rel) => {
      rel.fromColumns.forEach((col) => {
        const target = `${rel.toTable}.${rel.toColumns.join(', ')}`;
        acc[col] = acc[col] ? [...acc[col], target] : [target];
      });
      return acc;
    }, {});
  }, [graph.relations, selectedTable]);

  return (
    <div className="app-shell">
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
                  <div className="schema-panel__title">{selectedTable ? selectedTable.name : '테이블을 선택하세요'}</div>
                </div>
                {selectedTable && <span className="badge">{selectedTable.columns.length} cols</span>}
              </div>
              {selectedTable ? (
                <div className="schema-panel__table">
                  <div className="schema-table__header">
                    <span>컬럼</span>
                    <span>타입</span>
                    <span>Nullable</span>
                    <span>PK</span>
                    <span>Unique</span>
                    <span>Indexed</span>
                    <span>FK</span>
                  </div>
                  <div className="schema-table__body">
                    {selectedTable.columns.map((column) => (
                      <div key={column.name} className="schema-table__row">
                        <span>{column.name}</span>
                        <span>{column.type}</span>
                        <span>{column.nullable ? 'YES' : 'NO'}</span>
                        <span>{column.isPrimary ? '●' : '–'}</span>
                        <span>{column.isUnique ? '●' : '–'}</span>
                        <span>{column.isIndexed ? '●' : '–'}</span>
                        <span className="schema-fk-cell">
                          {fkLookup[column.name] ? fkLookup[column.name].join(', ') : '–'}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="schema-panel__empty">박스나 목록에서 테이블을 선택하면 스키마가 표시됩니다.</div>
              )}
            </div>
          </div>
          <div className="overlay-stack">
            <details className="control-card" open>
              <summary>Schema JSON</summary>
              <SchemaInputPanel value={inputValue} onChange={setInputValue} onSubmit={handleGraphChange} />
            </details>
            <details className="control-card" open={Boolean(selectedTable)}>
              <summary>Model 상세</summary>
              <ModelInfoPanel table={graph.tables.find((t) => t.name === activeTable)} />
            </details>
          </div>
        </div>
        <div className="scene-footer">Orbit: 드래그 · Zoom: 휠 · Pan: 우클릭</div>
      </main>
    </div>
  );
}
