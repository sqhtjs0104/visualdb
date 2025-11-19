import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Canvas, ThreeEvent } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { Relation, SchemaGraph, Table } from '../types';

type SchemaColor = {
  fill: string;
  emissive: string;
  activeFill: string;
  activeEmissive: string;
};

const SCHEMA_COLOR_PALETTE = [
  '#60a5fa',
  '#34d399',
  '#f59e0b',
  '#a855f7',
  '#f97316',
  '#22d3ee',
  '#f472b6',
  '#38bdf8',
  '#c084fc',
  '#e879f9',
];

const DEFAULT_SCHEMA_COLOR: SchemaColor = {
  fill: '#475569',
  emissive: '#1f2937',
  activeFill: '#4f46e5',
  activeEmissive: '#4338ca',
};

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

function adjustColor(hex: string, amount: number) {
  const normalized = hex.replace('#', '');
  const num = parseInt(normalized, 16);

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  const transform = (channel: number) => {
    if (amount >= 0) {
      return clamp(Math.round(channel + (255 - channel) * amount), 0, 255);
    }
    return clamp(Math.round(channel * (1 + amount)), 0, 255);
  };

  const toHex = (channel: number) => channel.toString(16).padStart(2, '0');

  return `#${toHex(transform(r))}${toHex(transform(g))}${toHex(transform(b))}`;
}

function buildSchemaColorMap(tables: Table[]): Record<string, SchemaColor> {
  const schemas = Array.from(new Set(tables.map((table) => table.schema))).sort();

  return schemas.reduce((acc, schema, index) => {
    const baseColor = SCHEMA_COLOR_PALETTE[index % SCHEMA_COLOR_PALETTE.length];
    acc[schema] = {
      fill: baseColor,
      emissive: adjustColor(baseColor, -0.45),
      activeFill: adjustColor(baseColor, 0.18),
      activeEmissive: adjustColor(baseColor, -0.1),
    };
    return acc;
  }, {} as Record<string, SchemaColor>);
}

type TableInstance = {
  table: Table;
  position: [number, number, number];
};

const BOX_DIMENSIONS = {
  width: 2.2,
  height: 1.2,
  depth: 1.6,
};

// const EDGE_HEIGHT = BOX_DIMENSIONS.height;
const EDGE_HEIGHT = 0;

const LABEL_OFFSETS = {
  topHeight: 0.001,
  frontDepth: 0.001,
};

function computeFallbackPositions(tables: Table[]): Record<string, [number, number, number]> {
  const grid: Record<string, [number, number, number]> = {};
  const columns = Math.ceil(Math.sqrt(tables.length));
  const spacing = 4;
  tables.forEach((table, idx) => {
    const row = Math.floor(idx / columns);
    const col = idx % columns;
    grid[table.name] = [col * spacing, 0, row * spacing];
  });
  return grid;
}

function useTableInstances(graph: SchemaGraph): TableInstance[] {
  return useMemo(() => {
    const fallback = computeFallbackPositions(graph.tables);
    const planeHeight = 0;
    return graph.tables.map((table) => {
      const layout = graph.layout?.nodes?.[table.name];
      const position: [number, number, number] = layout
        ? [layout.x, planeHeight, layout.z]
        : fallback[table.name] ?? [0, planeHeight, 0];
      return { table, position };
    });
  }, [graph]);
}

function TableBox({
  table,
  position,
  isActive,
  onSelect,
  colors,
}: TableInstance & { isActive: boolean; onSelect: () => void; colors: SchemaColor }) {
  const handlePointerOver = useCallback(() => {
    document.body.style.cursor = 'pointer';
  }, []);

  const handlePointerOut = useCallback(() => {
    document.body.style.cursor = 'auto';
  }, []);

  useEffect(() => {
    return () => {
      document.body.style.cursor = 'auto';
    };
  }, []);

  return (
    <group position={position} onClick={onSelect}>
      <mesh
        castShadow
        receiveShadow
        onPointerOver={(event) => {
          event.stopPropagation();
          handlePointerOver();
        }}
        onPointerMove={(event) => {
          event.stopPropagation();
          handlePointerOver();
        }}
        onPointerOut={(event) => {
          event.stopPropagation();
          handlePointerOut();
        }}
      >
        <boxGeometry args={[BOX_DIMENSIONS.width, BOX_DIMENSIONS.height, BOX_DIMENSIONS.depth]} />
        <meshStandardMaterial
          color={isActive ? colors.activeFill : colors.fill}
          emissive={isActive ? colors.activeEmissive : colors.emissive}
          opacity={0.98}
          transparent
        />
      </mesh>
      <Html
        transform
        occlude
        zIndexRange={[0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, BOX_DIMENSIONS.height / 2 + LABEL_OFFSETS.topHeight, 0]}
      >
        <div className="table-label-wrapper table-label-wrapper--top" onClick={onSelect}>
          <div className="table-label table-label--top">{table.name}</div>
        </div>
      </Html>
      <Html
        transform
        occlude
        zIndexRange={[0, 0]}
        position={[0, 0, BOX_DIMENSIONS.depth / 2 + LABEL_OFFSETS.frontDepth]}
      >
        <div className="table-label-wrapper table-label-wrapper--front" onClick={onSelect}>
          <div className="table-label table-label--front">{table.name}</div>
        </div>
      </Html>
    </group>
  );
}

function RelationEdge({
  from,
  to,
  isConnected,
  hasSelection,
  relation,
  onHover,
  onLeave,
}: {
  from: [number, number, number];
  to: [number, number, number];
  isConnected: boolean;
  hasSelection: boolean;
  relation: Relation;
  onHover: (relation: Relation, event: ThreeEvent<PointerEvent>) => void;
  onLeave: () => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const start: [number, number, number] = [from[0], EDGE_HEIGHT, from[2]];
  const end: [number, number, number] = [to[0], EDGE_HEIGHT, to[2]];
  const opacity = isHovered ? 1 : isConnected ? 0.9 : hasSelection ? 0.12 : 0.2;
  const width = (isHovered || isConnected) ? 3.5 : 2.5;
  const midpoint: [number, number, number] = useMemo(
    () => [(start[0] + end[0]) / 2, EDGE_HEIGHT + 0.05, (start[2] + end[2]) / 2],
    [start, end]
  );

  const handlePointerOver = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      setIsHovered(true);
      document.body.style.cursor = 'pointer';
      onHover(relation, event);
    },
    [onHover, relation]
  );

  const handlePointerMove = useCallback(
    (event: ThreeEvent<PointerEvent>) => {
      setIsHovered(true);
      document.body.style.cursor = 'pointer';
      onHover(relation, event);
    },
    [onHover, relation]
  );

  const handlePointerOut = useCallback(() => {
    setIsHovered(false);
    document.body.style.cursor = 'auto';
    onLeave();
  }, [onLeave]);

  useEffect(() => () => {
    document.body.style.cursor = 'auto';
  }, []);

  return (
    <group>
      <Line
        points={[start, end]}
        color="#ffffff"
        lineWidth={width * 2}
        transparent
        opacity={0}
        onPointerOver={handlePointerOver}
        onPointerMove={handlePointerMove}
        onPointerOut={handlePointerOut}
      />
      <Line
        points={[start, end]}
        color="#c4b5fd"
        lineWidth={width}
        transparent
        opacity={opacity}
        onPointerOut={handlePointerOut}
        onPointerOver={handlePointerOver}
      />
    </group>
  );
}

interface SceneProps {
  graph: SchemaGraph;
  activeTable?: string;
  onSelect: (table: string) => void;
}

export function Scene3D({ graph, activeTable, onSelect }: SceneProps) {
  const instances = useTableInstances(graph);
  const nodeLookup = useMemo(() => Object.fromEntries(instances.map((i) => [i.table.name, i.position])), [instances]);
  const cameraPosition = useMemo(() => [0, 16, 0.001] as [number, number, number], []);
  const schemaColorMap = useMemo(() => buildSchemaColorMap(graph.tables), [graph.tables]);
  const [hoveredRelation, setHoveredRelation] = useState<{
    relation: Relation;
    pointer: { x: number; y: number };
  } | null>(null);

  const handleRelationHover = useCallback((relation: Relation, event: ThreeEvent<PointerEvent>) => {
    setHoveredRelation({
      relation,
      pointer: { x: event.clientX, y: event.clientY },
    });
  }, []);

  const handleRelationLeave = useCallback(() => {
    setHoveredRelation(null);
  }, []);

  return (
    <div className="scene-container">
      <Canvas shadows className="canvas-wrapper" camera={{ position: cameraPosition, fov: 50 }}>
        <color attach="background" args={["#e5e7ec"]} />
        <hemisphereLight intensity={0.4} groundColor="#0f172a" />
        <directionalLight position={[8, 12, 6]} intensity={0.85} castShadow />
        <OrbitControls
          makeDefault
          enablePan
          enableRotate
          enableZoom
          enableDamping
          dampingFactor={0.06}
          autoRotate={false}
          target={[0, 0.4, 0]}
        />

        {instances.map((instance) => (
          <TableBox
            key={instance.table.name}
            {...instance}
            isActive={activeTable === instance.table.name}
            colors={schemaColorMap[instance.table.schema] ?? DEFAULT_SCHEMA_COLOR}
            onSelect={() => onSelect(instance.table.name)}
          />
        ))}

        {graph.relations.map((rel) => {
          const from = nodeLookup[rel.fromTable];
          const to = nodeLookup[rel.toTable];
          if (!from || !to) return null;
          const isConnected = activeTable === rel.fromTable || activeTable === rel.toTable;
          return (
            <RelationEdge
              key={rel.name}
              from={from}
              to={to}
              isConnected={isConnected}
              hasSelection={Boolean(activeTable)}
              relation={rel}
              onHover={handleRelationHover}
              onLeave={handleRelationLeave}
            />
          );
        })}
      </Canvas>

      {Object.entries(schemaColorMap).length > 0 && (
        <div className="schema-legend">
          <div className="schema-legend__title">Schemas</div>
          <div className="schema-legend__list">
            {Object.entries(schemaColorMap).map(([schema, colors]) => (
              <div key={schema} className="schema-legend__item">
                <span className="schema-legend__swatch" style={{ background: colors.fill }} />
                <span>{schema}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {hoveredRelation && (
        <div
          className="relation-tooltip relation-tooltip--floating"
          style={{ left: hoveredRelation.pointer.x + 14, top: hoveredRelation.pointer.y + 14 }}
        >
          <div className="relation-tooltip__path">
            {hoveredRelation.relation.fromTable}.{hoveredRelation.relation.fromColumns.join(', ')}{' '}
            <span className="relation-tooltip__arrow">→</span>{' '}
            {hoveredRelation.relation.toTable}.{hoveredRelation.relation.toColumns.join(', ')}
          </div>
          <div className="relation-tooltip__meta">
            <span>onUpdate: {hoveredRelation.relation.onUpdate ?? '—'}</span>
            <span>onDelete: {hoveredRelation.relation.onDelete ?? '—'}</span>
          </div>
        </div>
      )}
    </div>
  );
}
