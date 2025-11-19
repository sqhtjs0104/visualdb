import React from 'react';
import { Scene3D } from './components/Scene3D';
import { SchemaInputPanel } from './components/SchemaInputPanel';
import { mockGraph } from './mockData';
import { SchemaGraph, Table, Relation, Scenario } from './types';
import { TableSchemaEditor } from './components/TableSchemaEditor';

const SCHEMA_ENDPOINT = '/schemaGraph.json';

function buildRenameMap(previousTables: Table[], nextTables: Table[]) {
  const previousNames = new Set(previousTables.map((table) => table.name));
  const nextNames = new Set(nextTables.map((table) => table.name));
  const removed = Array.from(previousNames).filter((name) => !nextNames.has(name));
  const added = Array.from(nextNames).filter((name) => !previousNames.has(name));

  if (removed.length === 1 && added.length === 1) {
    return { [removed[0]]: added[0] } as Record<string, string>;
  }

  return {} as Record<string, string>;
}

function sanitizeScenarioTables(
  scenarios: Scenario[] | undefined = [],
  tables: Table[],
  renameMap: Record<string, string> = {}
) {
  const tableSet = new Set(tables.map((table) => table.name));

  return scenarios.map((scenario) => {
    const normalizedTables = Array.from(
      new Set(
        scenario.tableNames
          .map((name) => renameMap[name] ?? name)
          .filter((name) => tableSet.has(name))
      )
    );

    return { ...scenario, tableNames: normalizedTables };
  });
}

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
    console.error('Failed to write schemaGraph.json', error);
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
    console.error('Failed to read schemaGraph.json', error);
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
  const defaultGraph = React.useMemo(
    () => ({ ...mockGraph, scenarios: sanitizeScenarioTables(mockGraph.scenarios, mockGraph.tables) }),
    []
  );
  const [graph, setGraph] = React.useState<SchemaGraph>(defaultGraph);
  const [inputValue, setInputValue] = React.useState<string>(serializeGraph(defaultGraph));
  const [activeTable, setActiveTable] = React.useState<string | undefined>();
  const [isLayoutEditing, setIsLayoutEditing] = React.useState(false);
  const [isEditing, setIsEditing] = React.useState(false);
  const [draftTable, setDraftTable] = React.useState<Table | null>(null);
  const [isSchemaModalOpen, setIsSchemaModalOpen] = React.useState(false);
  const [layers, setLayers] = React.useState<Scenario[]>(defaultGraph.scenarios ?? []);
  const [activeLayerId, setActiveLayerId] = React.useState<string | null>(null);
  const [isLayerCreation, setIsLayerCreation] = React.useState(false);
  const [layerDraftSelection, setLayerDraftSelection] = React.useState<Set<string>>(new Set());
  const [draftLayerName, setDraftLayerName] = React.useState('');
  const [layerNameInput, setLayerNameInput] = React.useState('');

  const selectedTable = React.useMemo(() => graph.tables.find((t) => t.name === activeTable), [activeTable, graph.tables]);

  const activeLayer = React.useMemo(() => layers.find((layer) => layer.id === activeLayerId) ?? null, [activeLayerId, layers]);

  const displayedGraph = React.useMemo(() => {
    if (isLayerCreation || !activeLayer) return graph;
    const tableSet = new Set(activeLayer.tableNames);
    const tables = graph.tables.filter((table) => tableSet.has(table.name));
    const relations = graph.relations.filter(
      (rel) => tableSet.has(rel.fromTable) && tableSet.has(rel.toTable)
    );
    const positions = graph.positions
      ? Object.fromEntries(Object.entries(graph.positions).filter(([name]) => tableSet.has(name)))
      : undefined;

    return {
      ...graph,
      tables,
      relations,
      positions,
      scenarios: graph.scenarios,
    };
  }, [activeLayer, graph, isLayerCreation]);

  React.useEffect(() => {
    if (activeTable && !displayedGraph.tables.some((table) => table.name === activeTable)) {
      setActiveTable(undefined);
    }
  }, [activeTable, displayedGraph.tables]);

  const handleGraphChange = React.useCallback(
    (next: SchemaGraph, options?: { preserveActive?: boolean; skipPersist?: boolean }) => {
      const renameMap = buildRenameMap(graph.tables, next.tables);
      const baseScenarios = next.scenarios ?? [];
      const sanitizedScenarios = sanitizeScenarioTables(baseScenarios, next.tables, renameMap);
      const nextGraph = { ...next, scenarios: sanitizedScenarios };

      setGraph(nextGraph);
      setLayers(sanitizedScenarios);
      if (activeLayerId && !sanitizedScenarios.some((scenario) => scenario.id === activeLayerId)) {
        setActiveLayerId(null);
      }
      setInputValue(serializeGraph(nextGraph));
      if (!options?.preserveActive) {
        setActiveTable(undefined);
      }
      if (!options?.skipPersist) {
        void persistSchemaToFile(nextGraph);
      }
    },
    [activeLayerId, graph.scenarios, graph.tables, layers]
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

  const handleTableSelect = (tableName: string) => {
    if (isLayerCreation) {
      setLayerDraftSelection((prev) => {
        const next = new Set(prev);
        if (next.has(tableName)) {
          next.delete(tableName);
        } else {
          next.add(tableName);
        }
        return next;
      });
    }
    setActiveTable(tableName);
  };

  const handleLayoutChange = React.useCallback(
    (tableName: string, position: [number, number, number], options?: { lockZ?: boolean }) => {
      const nodes = { ...(graph.positions ?? {}) };
      const previous = nodes[tableName];
      const y = previous?.y ?? position[1];
      const z = options?.lockZ && previous ? previous.z : position[2];
      nodes[tableName] = { x: position[0], y, z };
      handleGraphChange(
        {
          ...graph,
          positions: nodes,
        },
        { preserveActive: true }
      );
    },
    [graph, handleGraphChange]
  );

  const handleSchemaFileLoad = (next: SchemaGraph, raw: string) => {
    setInputValue(raw);
    handleGraphChange(next);
  };

  const handleExportSchema = () => {
    const blob = new Blob([serializeGraph(graph)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'schemaGraph.json';
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCancelEdit = () => {
    if (selectedTable) {
      setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
    }
    setIsEditing(false);
  };

  const handleStartLayerCreation = () => {
    setActiveLayerId(null);
    setIsLayerCreation(true);
    setLayerDraftSelection(new Set());
    setDraftLayerName(`시나리오 ${layers.length + 1}`);
  };

  const handleCancelLayerCreation = () => {
    setIsLayerCreation(false);
    setLayerDraftSelection(new Set());
    setDraftLayerName('');
  };

  const handleSaveLayerCreation = () => {
    if (layerDraftSelection.size === 0) return;
    const name = (draftLayerName || '').trim() || `시나리오 ${layers.length + 1}`;
    const nextLayer: Scenario = {
      id: `layer-${Date.now()}`,
      name,
      tableNames: Array.from(layerDraftSelection),
      steps: [],
    };

    const nextScenarios = [...layers, nextLayer];
    handleGraphChange(
      {
        ...graph,
        scenarios: nextScenarios,
      },
      { preserveActive: true }
    );
    setActiveLayerId(nextLayer.id);
    setLayerNameInput(name);
    setIsLayerCreation(false);
    setLayerDraftSelection(new Set());
  };

  const handleLayerSelect = (layerId: string | null) => {
    setActiveLayerId(layerId);
    setIsLayerCreation(false);
    setLayerDraftSelection(new Set());
  };

  const layerSequence = React.useMemo(
    () => [{ id: null, name: '기본 뷰' }, ...layers.map((layer) => ({ id: layer.id, name: layer.name }))],
    [layers]
  );

  const activeLayerIndex = React.useMemo(
    () => layerSequence.findIndex((layer) => layer.id === activeLayerId),
    [activeLayerId, layerSequence]
  );

  const handleNavigateLayer = (direction: 'prev' | 'next') => {
    const delta = direction === 'prev' ? -1 : 1;
    const nextIndex = activeLayerIndex + delta;
    if (nextIndex < 0 || nextIndex >= layerSequence.length) return;
    const targetLayer = layerSequence[nextIndex];
    handleLayerSelect(targetLayer.id);
  };

  const handleLayerNameChange = (name: string) => {
    setLayerNameInput(name);
    if (!activeLayerId) return;
    const renamedScenarios = layers.map((layer) => (layer.id === activeLayerId ? { ...layer, name } : layer));
    handleGraphChange(
      {
        ...graph,
        scenarios: renamedScenarios,
      },
      { preserveActive: true }
    );
  };

  React.useEffect(() => {
    setLayerNameInput(activeLayer?.name ?? '');
  }, [activeLayer?.name]);

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

  const canNavigatePrev = !isLayerCreation && activeLayerIndex > 0;
  const canNavigateNext = !isLayerCreation && activeLayerIndex < layerSequence.length - 1;
  const activeLayerLabel = activeLayer?.name ?? '기본 뷰';
  const canSaveLayerDraft = layerDraftSelection.size > 0;

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
        <Scene3D
          graph={displayedGraph}
          activeTable={activeTable}
          onSelect={handleTableSelect}
          isLayoutEditing={isLayoutEditing}
          onLayoutChange={handleLayoutChange}
          isLayerDraftMode={isLayerCreation}
          layerDraftSelection={layerDraftSelection}
        />
        <div className="overlay-panel">
          <div className="title" style={{ marginBottom: 12 }}>
            <span>테이블 선택</span>
            <span className="badge">{displayedGraph.tables.length} tables</span>
          </div>
          <div className="overlay-content">
            <div className="table-list">
              {displayedGraph.tables.map((table) => (
                <button
                  type="button"
                  key={table.name}
                  className={`table-pill ${activeTable === table.name ? 'active' : ''} ${
                    isLayerCreation ? 'table-pill--layer-draft' : ''
                  } ${layerDraftSelection.has(table.name) ? 'table-pill--layer-draft-selected' : ''}`}
                  onClick={() => handleTableSelect(table.name)}
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

        <div className="layer-remote">
          <div className="layer-remote__strip">
            <span className="label">시나리오표</span>
            <div className="layer-remote__badge-row">
              <button
                type="button"
                className={`layer-remote__badge ${activeLayerId === null ? 'layer-remote__badge--active' : ''}`}
                onClick={() => handleLayerSelect(null)}
              >
                기본
              </button>
              {layers.map((layer, index) => (
                <button
                  type="button"
                  key={layer.id}
                  className={`layer-remote__badge ${activeLayerId === layer.id ? 'layer-remote__badge--active' : ''}`}
                  onClick={() => handleLayerSelect(layer.id)}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </div>

          <div className="layer-remote__panel">
            <div className="layer-remote__header">
              <div>
                <div className="label">현재 레이어</div>
                <div className="layer-remote__title">{activeLayerLabel}</div>
              </div>
              <button type="button" className="small-button" onClick={() => handleLayerSelect(null)} disabled={isLayerCreation}>
                초기 화면
              </button>
            </div>

            <div className="layer-remote__row">
              <button
                type="button"
                className="small-button"
                onClick={() => handleNavigateLayer('prev')}
                disabled={!canNavigatePrev}
              >
                ▲ 위 레이어
              </button>
              <button
                type="button"
                className="small-button"
                onClick={() => handleNavigateLayer('next')}
                disabled={!canNavigateNext}
              >
                ▼ 아래 레이어
              </button>
            </div>

            <div className="layer-remote__row">
              <select
                className="select-input layer-remote__select"
                value={activeLayerId ?? 'base'}
                onChange={(e) => handleLayerSelect(e.target.value === 'base' ? null : e.target.value)}
                disabled={isLayerCreation}
              >
                <option value="base">기본 뷰</option>
                {layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
              <button type="button" className="small-button" onClick={handleStartLayerCreation} disabled={isLayerCreation}>
                레이어 추가
              </button>
            </div>

            {!isLayerCreation && activeLayer && (
              <div className="layer-remote__row layer-remote__rename">
                <label className="label" htmlFor="layer-name-input">
                  레이어 이름 변경
                </label>
                <input
                  id="layer-name-input"
                  className="text-input"
                  value={layerNameInput}
                  onChange={(e) => handleLayerNameChange(e.target.value)}
                  placeholder="레이어 이름"
                />
              </div>
            )}

            {isLayerCreation && (
              <div className="layer-remote__creation">
                <div className="input-group">
                  <label className="label" htmlFor="new-layer-name">
                    새 레이어 이름
                  </label>
                  <input
                    id="new-layer-name"
                    className="text-input"
                    value={draftLayerName}
                    onChange={(e) => setDraftLayerName(e.target.value)}
                    placeholder="시나리오 이름"
                  />
                </div>
                <div className="layer-remote__hint">
                  테이블 박스를 클릭하여 시나리오에 포함할 테이블을 토글하세요. 선택된 테이블은 불투명하게 표시됩니다.
                </div>
                <div className="layer-remote__draft-summary">
                  현재 선택: <strong>{layerDraftSelection.size}</strong>개 테이블
                </div>
                <div className="layer-remote__row">
                  <button type="button" className="small-button" onClick={handleSaveLayerCreation} disabled={!canSaveLayerDraft}>
                    저장
                  </button>
                  <button type="button" className="ghost-button" onClick={handleCancelLayerCreation}>
                    취소
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="scene-footer">
          <div className="scene-footer__controls">
            <button
              type="button"
              className={`small-button ${isLayoutEditing ? 'small-button--active' : ''}`}
              onClick={() => setIsLayoutEditing((prev) => !prev)}
            >
              {isLayoutEditing ? '레이아웃 편집 종료' : '레이아웃 편집'}
            </button>
            <span className="scene-footer__hint">드래그로 위치 변경 · Shift 로 Z 고정</span>
          </div>
          <div>Orbit: 드래그 · Zoom: 휠 · Pan: 우클릭</div>
        </div>
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
