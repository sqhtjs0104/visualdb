import React from 'react';
import { Scene3D } from './components/Scene3D';
import { SchemaInputPanel } from './components/SchemaInputPanel';
import { mockGraph } from './mockData';
import { SchemaGraph, Table, Relation, Scenario, ScenarioStep } from './types';
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

function generateUniqueTableName(base: string, tables: Table[]) {
  const existing = new Set(tables.map((table) => table.name));
  if (!existing.has(base)) return base;
  let counter = 1;
  let candidate = `${base}_${counter}`;
  while (existing.has(candidate)) {
    counter += 1;
    candidate = `${base}_${counter}`;
  }
  return candidate;
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
  const [isScenarioEditing, setIsScenarioEditing] = React.useState(false);
  const [layerDraftSelection, setLayerDraftSelection] = React.useState<Set<string>>(new Set());
  const [draftLayerName, setDraftLayerName] = React.useState('');
  const [layerNameInput, setLayerNameInput] = React.useState('');
  const [flowDrafts, setFlowDrafts] = React.useState<ScenarioStep[]>([]);
  const [isFlowEditing, setIsFlowEditing] = React.useState(false);
  const [isCreatingTable, setIsCreatingTable] = React.useState(false);
  const [tableEditOrigin, setTableEditOrigin] = React.useState<string | null>(null);
  const [tableLayerPopup, setTableLayerPopup] = React.useState<{
    tableName: string;
    x: number;
    y: number;
  } | null>(null);
  const tableLayerPopupRef = React.useRef<HTMLDivElement | null>(null);

  const selectedTable = React.useMemo(() => graph.tables.find((t) => t.name === activeTable), [activeTable, graph.tables]);

  const activeLayer = React.useMemo(() => layers.find((layer) => layer.id === activeLayerId) ?? null, [activeLayerId, layers]);

  const displayedGraph = React.useMemo(() => {
    if (isLayerCreation || isScenarioEditing || !activeLayer) return graph;
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
  }, [activeLayer, graph, isLayerCreation, isScenarioEditing]);

  React.useEffect(() => {
    if (activeTable && !displayedGraph.tables.some((table) => table.name === activeTable)) {
      setActiveTable(undefined);
    }
  }, [activeTable, displayedGraph.tables]);

  React.useEffect(() => {
    if (!tableLayerPopup) return;
    const handleWindowMouseDown = (event: MouseEvent) => {
      if (!tableLayerPopupRef.current) return;
      if (!tableLayerPopupRef.current.contains(event.target as Node)) {
        setTableLayerPopup(null);
      }
    };
    window.addEventListener('mousedown', handleWindowMouseDown);
    return () => {
      window.removeEventListener('mousedown', handleWindowMouseDown);
    };
  }, [tableLayerPopup]);

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
    if (isCreatingTable) return;
    if (!selectedTable) {
      setDraftTable(null);
      setIsEditing(false);
      setTableEditOrigin(null);
      return;
    }
    setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
    setTableEditOrigin(selectedTable.name);
    setIsEditing(false);
  }, [graph.relations, isCreatingTable, selectedTable]);

  React.useEffect(() => {
    const bootstrapFromFile = async () => {
      const loaded = await loadSchemaFromFile();
      if (!loaded) return;
      handleGraphChange(loaded, { preserveActive: true, skipPersist: true });
    };

    void bootstrapFromFile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleDraftChange = (next: Table) => {
    setDraftTable(next);
  };

  const handleTableSelect = (
    tableName: string,
    options?: {
      pointer?: { x: number; y: number };
    }
  ) => {
    if (isLayerCreation || isScenarioEditing) {
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
    if (isCreatingTable) {
      setIsCreatingTable(false);
      setDraftTable(null);
      setIsEditing(false);
      setTableEditOrigin(null);
    }

    if (options?.pointer) {
      setTableLayerPopup({ tableName, x: options.pointer.x, y: options.pointer.y });
    } else {
      setTableLayerPopup(null);
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
    if (isCreatingTable) {
      setIsCreatingTable(false);
      setDraftTable(null);
      setTableEditOrigin(null);
      setIsEditing(false);
      return;
    }
    if (selectedTable) {
      setDraftTable(attachColumnForeignKeys(selectedTable, graph.relations));
      setTableEditOrigin(selectedTable.name);
    }
    setIsEditing(false);
  };

  const handleStartLayerCreation = () => {
    setActiveLayerId(null);
    setIsLayerCreation(true);
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
    setDraftLayerName(`시나리오 ${layers.length + 1}`);
  };

  const handleCancelLayerCreation = () => {
    setIsLayerCreation(false);
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
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
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
  };

  const handleLayerSelect = (layerId: string | null) => {
    setTableLayerPopup(null);
    setActiveLayerId(layerId);
    setIsLayerCreation(false);
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
  };

  const handleStartScenarioEdit = () => {
    if (!activeLayer || isLayerCreation) return;
    setIsScenarioEditing(true);
    setIsLayerCreation(false);
    setLayerDraftSelection(new Set(activeLayer.tableNames));
    setLayerNameInput(activeLayer.name);
    resetFlowDraftsFromLayer();
  };

  const handleCancelScenarioEdit = () => {
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set(activeLayer?.tableNames ?? []));
    setLayerNameInput(activeLayer?.name ?? '');
    resetFlowDraftsFromLayer();
  };

  const handleFlowDraftChange = (index: number, description: string) => {
    setFlowDrafts((prev) => prev.map((step, idx) => (idx === index ? { ...step, description } : step)));
  };

  const handleAddFlowDraft = () => {
    setFlowDrafts((prev) => [...prev, { order: prev.length + 1, description: '' }]);
  };

  const handleRemoveFlowDraft = (index: number) => {
    setFlowDrafts((prev) => prev.filter((_, idx) => idx !== index));
  };

  const handleReorderFlowDraft = (index: number, direction: 'up' | 'down') => {
    setFlowDrafts((prev) => {
      const target = index + (direction === 'up' ? -1 : 1);
      if (target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      const [moved] = next.splice(index, 1);
      next.splice(target, 0, moved);
      return next;
    });
  };

  const handleSaveScenarioEdit = () => {
    if (!activeLayer) return;
    const sanitizedName = (layerNameInput || '').trim() || activeLayer.name;
    const normalizedSteps = flowDraftSteps.map((step, index) => ({
      order: index + 1,
      description: step.description.trim() || `단계 ${index + 1}`,
    }));
    const updatedLayer: Scenario = {
      ...activeLayer,
      name: sanitizedName,
      steps: normalizedSteps,
      tableNames: Array.from(layerDraftSelection),
    };
    const nextScenarios = layers.map((layer) => (layer.id === activeLayer.id ? updatedLayer : layer));

    handleGraphChange(
      {
        ...graph,
        scenarios: nextScenarios,
      },
      { preserveActive: true }
    );
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
  };

  const handleLayerNameChange = (name: string) => {
    setLayerNameInput(name);
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
    const originName = tableEditOrigin ?? draftTable.name;
    const isNewTable = isCreatingTable || !graph.tables.some((table) => table.name === originName);

    const nextTables = isNewTable
      ? [...graph.tables, updatedTable]
      : graph.tables.map((table) => (table.name === originName ? updatedTable : table));

    const preservedRelations = graph.relations
      .filter((rel) => rel.fromTable !== originName)
      .map((rel) => {
        if (rel.toTable === originName) {
          return { ...rel, toTable: updatedTable.name };
        }
        return rel;
      });

    const nextPositions =
      graph.positions && tableEditOrigin && tableEditOrigin !== updatedTable.name
        ? Object.entries(graph.positions).reduce((acc, [name, position]) => {
          if (name === tableEditOrigin) {
            acc[updatedTable.name] = position;
          } else {
            acc[name] = position;
          }
          return acc;
        }, {} as NonNullable<SchemaGraph['positions']>)
        : graph.positions;

    const nextGraph = {
      ...graph,
      tables: nextTables,
      relations: [...preservedRelations, ...updatedRelations],
      positions: nextPositions,
    };

    handleGraphChange(nextGraph, { preserveActive: true });
    setIsEditing(false);
    setIsCreatingTable(false);
    setTableEditOrigin(updatedTable.name);
    setActiveTable(updatedTable.name);
  };

  const hydratedSelectedTable = selectedTable ? attachColumnForeignKeys(selectedTable, graph.relations) : undefined;
  const panelTitle = (isEditing || isCreatingTable) && draftTable ? draftTable.name : hydratedSelectedTable?.name ?? '테이블을 선택하세요';
  const panelComment = (isEditing || isCreatingTable) && draftTable ? draftTable.comment : hydratedSelectedTable?.comment;
  const panelColumnCount =
    (isEditing || isCreatingTable) && draftTable
      ? draftTable.columns.length
      : hydratedSelectedTable?.columns.length ?? 0;
  const hasEditableContext = Boolean(hydratedSelectedTable || (isCreatingTable && draftTable));
  const isLayerDraftMode = isLayerCreation || isScenarioEditing;
  const activeLayerLabel = activeLayer?.name ?? '기본 뷰';
  const canSaveLayerDraft = layerDraftSelection.size > 0;

  React.useEffect(() => {
    if (!isLayerDraftMode && layerDraftSelection.size > 0) {
      setLayerDraftSelection(new Set());
    }
  }, [isLayerDraftMode, layerDraftSelection]);
  const activeLayerSteps = React.useMemo(
    () => [...(activeLayer?.steps ?? [])].sort((a, b) => a.order - b.order),
    [activeLayer?.steps]
  );
  const flowDraftSteps = React.useMemo(
    () => flowDrafts.map((step, index) => ({ ...step, order: index + 1 })),
    [flowDrafts]
  );
  const popupLayers = React.useMemo(
    () =>
      tableLayerPopup
        ? layers.filter((layer) => layer.tableNames.includes(tableLayerPopup.tableName))
        : [],
    [layers, tableLayerPopup]
  );

  const resetFlowDraftsFromLayer = React.useCallback(() => {
    setFlowDrafts(activeLayerSteps.map((step, index) => ({ ...step, order: index + 1 })));
  }, [activeLayerSteps]);

  React.useEffect(() => {
    resetFlowDraftsFromLayer();
    setIsScenarioEditing(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
  }, [activeLayerId, activeLayerSteps, resetFlowDraftsFromLayer]);

  const handleDeleteLayer = () => {
    if (!activeLayer) return;
    const confirmed = window.confirm('현재 시나리오 레이어를 삭제할까요?');
    if (!confirmed) return;
    const nextScenarios = layers.filter((layer) => layer.id !== activeLayer.id);
    handleGraphChange(
      {
        ...graph,
        scenarios: nextScenarios,
      },
      { preserveActive: true }
    );
    setActiveLayerId(null);
    setIsScenarioEditing(false);
    setIsLayerCreation(false);
    setIsFlowEditing(false);
    setLayerDraftSelection(new Set());
    setLayerNameInput('');
  };

  const handleStartTableCreation = () => {
    const baseName = generateUniqueTableName('new_table', graph.tables);
    const nextTable: Table = {
      name: baseName,
      domain: 'public',
      columns: [],
      primaryKey: [],
      indexes: [],
      comment: '',
    };
    setIsCreatingTable(true);
    setIsEditing(true);
    setDraftTable(nextTable);
    setTableEditOrigin(null);
  };

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
          isLayerDraftMode={isLayerDraftMode}
          layerDraftSelection={layerDraftSelection}
        />
        {tableLayerPopup && (
          <div
            ref={tableLayerPopupRef}
            className="table-layer-popup"
            style={{ top: tableLayerPopup.y + 12, left: tableLayerPopup.x + 12 }}
          >
            <div className="table-layer-popup__header">
              <div className="table-layer-popup__title">
                <strong className="table-layer-popup__table-name">{tableLayerPopup.tableName}</strong>
              </div>
              <button
                type="button"
                className="table-layer-popup__close"
                aria-label="레이어 팝업 닫기"
                onClick={() => setTableLayerPopup(null)}
              >
                ×
              </button>
            </div>
            {popupLayers.length === 0 ? (
              <div className="table-layer-popup__empty">이 테이블을 포함하는 레이어가 없습니다.</div>
            ) : (
              <div className="table-layer-popup__list">
                {popupLayers.map((layer) => (
                  <button
                    key={layer.id}
                    type="button"
                    className={`table-layer-popup__item ${activeLayerId === layer.id ? 'table-layer-popup__item--active' : ''}`}
                    onClick={() => handleLayerSelect(layer.id)}
                  >
                    {layer.name}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <div className="overlay-panel">
          <div
            className="title"
            style={{ marginBottom: 12, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span>테이블 선택</span>
              <span className="badge">{displayedGraph.tables.length} tables</span>
            </div>
            {
              !isCreatingTable && (
                <button type="button" className="small-button" onClick={handleStartTableCreation} disabled={isLayerDraftMode}>
                  + 테이블 추가
                </button>
              )
            }
          </div>
          <div className="overlay-content">
            <div className="table-list">
              {displayedGraph.tables.map((table) => (
                <button
                  type="button"
                  key={table.name}
                  className={`table-pill ${activeTable === table.name ? 'active' : ''} ${isLayerDraftMode ? 'table-pill--layer-draft' : ''
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
                  <div className="schema-panel__title">
                    {panelTitle}
                  </div>
                  {panelComment && <div className="schema-panel__comment">{panelComment}</div>}
                </div>
                {hasEditableContext && (
                  <div className="schema-panel__actions">
                    <span className="badge">{panelColumnCount} cols</span>
                    {!isEditing && hydratedSelectedTable ? (
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
              {(isEditing || isCreatingTable) && draftTable ? (
                <TableSchemaEditor table={draftTable} tables={graph.tables} onChange={handleDraftChange} />
              ) : hydratedSelectedTable ? (
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
              ) : (
                <div className="schema-panel__empty">박스나 목록에서 테이블을 선택하면 스키마가 표시됩니다.</div>
              )}
            </div>
          </div>
        </div>

        <div className="layer-remote">
          <div className="layer-remote__panel">
            <div className="layer-remote__header">
              <div className="layer-remote__title">{activeLayerLabel}</div>
            </div>

            <div className="layer-remote__row">
              <select
                className="select-input layer-remote__select"
                value={activeLayerId ?? 'base'}
                onChange={(e) => handleLayerSelect(e.target.value === 'base' ? null : e.target.value)}
                disabled={isLayerDraftMode}
              >
                <option value="base">기본 뷰</option>
                {layers.map((layer) => (
                  <option key={layer.id} value={layer.id}>
                    {layer.name}
                  </option>
                ))}
              </select>
              <button type="button" className="small-button" onClick={handleStartLayerCreation} disabled={isLayerDraftMode}>
                레이어 추가
              </button>
              {activeLayer && !isLayerCreation && (
                <>
                  {isScenarioEditing ? (
                    <div className="edit-action-group">
                      <button
                        type="button"
                        className="small-button"
                        onClick={handleSaveScenarioEdit}
                        disabled={!canSaveLayerDraft}
                      >
                        저장
                      </button>
                      <button type="button" className="ghost-button" onClick={handleCancelScenarioEdit}>
                        취소
                      </button>
                    </div>
                  ) : (
                    <div className="edit-action-group">
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleStartScenarioEdit}
                        disabled={isLayerDraftMode}
                      >
                        편집
                      </button>
                      <button
                        type="button"
                        className="ghost-button"
                        onClick={handleDeleteLayer}
                        disabled={isLayerDraftMode}
                      >
                        삭제
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {isScenarioEditing && activeLayer && (
              <>
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
                <div className="layer-remote__flow-editor">
                  <div className="layer-remote__flow-editor__header">
                    <span className="label">시나리오 플로우</span>
                    <button type="button" className="small-button" onClick={handleAddFlowDraft}>
                      플로우 추가
                    </button>
                  </div>
                  {flowDraftSteps.length === 0 ? (
                    <div className="layer-remote__flow-empty">플로우를 추가해 시나리오를 구성하세요.</div>
                  ) : (
                    <div className="layer-remote__flow-editor__list">
                      {flowDraftSteps.map((step, index) => (
                        <div key={`${activeLayer.id}-draft-step-${index}`} className="layer-remote__flow-row">
                          <span className="layer-remote__flow-order">{step.order}</span>
                          <input
                            className="text-input layer-remote__flow-input"
                            value={step.description}
                            onChange={(e) => handleFlowDraftChange(index, e.target.value)}
                            placeholder="플로우 이름"
                          />
                          <div className="layer-remote__flow-controls">
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleReorderFlowDraft(index, 'up')}
                              disabled={index === 0}
                            >
                              위
                            </button>
                            <button
                              type="button"
                              className="ghost-button"
                              onClick={() => handleReorderFlowDraft(index, 'down')}
                              disabled={index === flowDraftSteps.length - 1}
                            >
                              아래
                            </button>
                            <button
                              type="button"
                              className="ghost-button layer-remote__flow-remove"
                              onClick={() => handleRemoveFlowDraft(index)}
                            >
                              제거
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
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

            {isScenarioEditing && activeLayer && (
              <div className="layer-remote__creation">
                <div className="layer-remote__hint">편집할 테이블을 토글하세요. 선택된 항목이 현재 시나리오에 포함됩니다.</div>
                <div className="layer-remote__draft-summary">
                  포함 테이블: <strong>{layerDraftSelection.size}</strong>개
                </div>
              </div>
            )}

            {!isLayerDraftMode && activeLayerSteps.length > 0 && (
              <div className="layer-remote__flow">
                <div className="label">시나리오 플로우</div>
                <ol className="layer-remote__flow-list">
                  {activeLayerSteps.map((step) => (
                    <li key={`${activeLayer?.id ?? 'layer'}-step-${step.order}`}>
                      <span className="layer-remote__flow-order">{step.order}</span>
                      <span>{step.description}</span>
                    </li>
                  ))}
                </ol>
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
