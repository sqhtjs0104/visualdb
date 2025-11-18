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

  const handleGraphChange = (next: SchemaGraph) => {
    setGraph(next);
    setActiveTable(undefined);
  };

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
        </div>
        <div className="scene-footer">Orbit: 드래그 · Zoom: 휠 · Pan: 우클릭</div>
      </main>
    </div>
  );
}
