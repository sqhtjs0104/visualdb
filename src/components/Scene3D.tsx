import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, ThreeEvent, useThree } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
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

function buildDomainColorMap(tables: Table[]): Record<string, SchemaColor> {
  const domains = Array.from(new Set(tables.map((table) => table.domain))).sort();

  return domains.reduce((acc, domain, index) => {
    const baseColor = SCHEMA_COLOR_PALETTE[index % SCHEMA_COLOR_PALETTE.length];
    acc[domain] = {
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

const BOX_PADDING = 0.3;

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
    return graph.tables.map((table) => {
      const savedPosition = graph.positions?.[table.name];
      const planeHeight = savedPosition?.y ?? 0;
      const position: [number, number, number] = savedPosition
        ? [savedPosition.x, planeHeight, savedPosition.z]
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
  isInvalid,
  onPointerDown,
}: TableInstance & {
  isActive: boolean;
  onSelect: () => void;
  colors: SchemaColor;
  isInvalid?: boolean;
  onPointerDown?: (event: ThreeEvent<PointerEvent>) => void;
}) {
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
    <group position={position} onClick={onSelect} onPointerDown={onPointerDown}>
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
          color={isInvalid ? '#f87171' : isActive ? colors.activeFill : colors.fill}
          emissive={isInvalid ? '#b91c1c' : isActive ? colors.activeEmissive : colors.emissive}
          opacity={isInvalid ? 0.82 : 0.98}
          transparent
        />
      </mesh>
      <Html
        transform
        occlude
        zIndexRange={[0, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, BOX_DIMENSIONS.height / 2 + LABEL_OFFSETS.topHeight, 0]}
        wrapperClass="table-box"
        className="table-label-wrapper table-label-wrapper--top"
        onClick={onSelect}
      >
        <div className="table-label table-label--top">{table.name}</div>
      </Html>
      <Html
        transform
        occlude
        zIndexRange={[0, 0]}
        position={[0, 0, BOX_DIMENSIONS.depth / 2 + LABEL_OFFSETS.frontDepth]}
        wrapperClass="table-box"
        className="table-label-wrapper table-label-wrapper--front"
        onClick={onSelect}
      >
        <div className="table-label table-label--front">{table.name}</div>
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

type DragState = {
  tableName: string;
  planeY: number;
  startPosition: [number, number, number];
  currentPosition: [number, number, number];
  lastValidPosition: [number, number, number];
  isValid: boolean;
  lockZ: boolean;
};

type DragFeedback = { message: string; isError?: boolean } | null;

function SceneContent({
  graph,
  activeTable,
  onSelect,
  domainColorMap,
  onRelationHover,
  onRelationLeave,
  isLayoutEditing,
  onLayoutChange,
  onDragFeedbackChange,
}: {
  graph: SchemaGraph;
  activeTable?: string;
  onSelect: (table: string) => void;
  domainColorMap: Record<string, SchemaColor>;
  onRelationHover: (relation: Relation, event: ThreeEvent<PointerEvent>) => void;
  onRelationLeave: () => void;
  isLayoutEditing: boolean;
  onLayoutChange: (tableName: string, position: [number, number, number], options?: { lockZ?: boolean }) => void;
  onDragFeedbackChange: (feedback: DragFeedback) => void;
}) {
  const instances = useTableInstances(graph);
  const [dragState, setDragState] = useState<DragState | null>(null);
  const controlsRef = useRef<any>(null);
  const { camera, gl } = useThree();

  const displayedInstances = useMemo(() => {
    if (!dragState) return instances;
    return instances.map((instance) =>
      instance.table.name === dragState.tableName
        ? { ...instance, position: dragState.currentPosition }
        : instance
    );
  }, [dragState, instances]);

  const nodeLookup = useMemo(
    () => Object.fromEntries(displayedInstances.map((i) => [i.table.name, i.position])),
    [displayedInstances]
  );

  const halfWidth = BOX_DIMENSIONS.width / 2 + BOX_PADDING;
  const halfDepth = BOX_DIMENSIONS.depth / 2 + BOX_PADDING;

  const boundsForPosition = useCallback(
    (position: [number, number, number]) => ({
      minX: position[0] - halfWidth,
      maxX: position[0] + halfWidth,
      minZ: position[2] - halfDepth,
      maxZ: position[2] + halfDepth,
    }),
    [halfDepth, halfWidth]
  );

  const findOverlaps = useCallback(
    (candidate: [number, number, number], tableName: string) => {
      const candidateBounds = boundsForPosition(candidate);
      return instances
        .filter((instance) => instance.table.name !== tableName)
        .filter((instance) => {
          const bounds = boundsForPosition(instance.position);
          return !(
            candidateBounds.maxX < bounds.minX ||
            candidateBounds.minX > bounds.maxX ||
            candidateBounds.maxZ < bounds.minZ ||
            candidateBounds.minZ > bounds.maxZ
          );
        })
        .map((instance) => instance.table.name);
    },
    [boundsForPosition, instances]
  );

  useEffect(() => {
    if (!isLayoutEditing && dragState) {
      setDragState(null);
      onDragFeedbackChange(null);
    }
  }, [dragState, isLayoutEditing, onDragFeedbackChange]);

  useEffect(() => {
    if (!controlsRef.current) return;
    controlsRef.current.enabled = !Boolean(dragState);
  }, [dragState]);

  const handleTablePointerDown = useCallback(
    (instance: TableInstance, event: ThreeEvent<PointerEvent>) => {
      if (!isLayoutEditing) return;
      event.stopPropagation();
      const layoutY = graph.positions?.[instance.table.name]?.y ?? instance.position[1] ?? 0;
      const lockZ = event.shiftKey;
      setDragState({
        tableName: instance.table.name,
        planeY: layoutY,
        startPosition: instance.position,
        currentPosition: instance.position,
        lastValidPosition: instance.position,
        isValid: true,
        lockZ,
      });
      onDragFeedbackChange({ message: lockZ ? 'Z locked while dragging' : 'Drag tables on the X–Z plane' });
      onSelect(instance.table.name);
    },
    [graph.positions, isLayoutEditing, onDragFeedbackChange, onSelect]
  );

  useEffect(() => {
    if (!dragState) return;

    const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -dragState.planeY);
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();

    const handlePointerMove = (event: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const intersection = new THREE.Vector3();
      const hit = raycaster.ray.intersectPlane(plane, intersection);
      if (!hit) return;
      const lockZ = event.shiftKey || dragState.lockZ;
      const candidate: [number, number, number] = [intersection.x, dragState.planeY, lockZ ? dragState.startPosition[2] : intersection.z];
      const overlaps = findOverlaps(candidate, dragState.tableName);
      const isValid = overlaps.length === 0;

      setDragState((prev) =>
        prev
          ? {
            ...prev,
            lockZ,
            currentPosition: candidate,
            lastValidPosition: isValid ? candidate : prev.lastValidPosition,
            isValid,
          }
          : prev
      );

      onDragFeedbackChange(
        isValid
          ? lockZ
            ? { message: 'Z locked while dragging' }
            : { message: 'Drag tables on the X–Z plane' }
          : { message: `Placement overlaps ${overlaps.join(', ')}`, isError: true }
      );
    };

    const handlePointerUp = (event: PointerEvent) => {
      event.preventDefault();
      setDragState((current) => {
        if (!current) return current;
        const finalPosition = current.isValid ? current.currentPosition : current.lastValidPosition;
        const shouldPersist =
          finalPosition[0] !== current.startPosition[0] ||
          finalPosition[2] !== current.startPosition[2];
        if (shouldPersist) {
          onLayoutChange(current.tableName, finalPosition, { lockZ: current.lockZ });
        }
        onDragFeedbackChange(null);
        return null;
      });
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp, { once: true });

    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      onDragFeedbackChange(null);
    };
  }, [camera, dragState, findOverlaps, gl, onDragFeedbackChange, onLayoutChange]);

  return (
    <>
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enablePan
        enableRotate
        enableZoom
        enableDamping
        dampingFactor={0.06}
        autoRotate={false}
        target={[0, 0.4, 0]}
      />

      {displayedInstances.map((instance) => (
        <TableBox
          key={instance.table.name}
          {...instance}
          isActive={activeTable === instance.table.name}
          colors={domainColorMap[instance.table.domain] ?? DEFAULT_SCHEMA_COLOR}
          onSelect={() => onSelect(instance.table.name)}
          isInvalid={dragState?.tableName === instance.table.name && !dragState.isValid}
          onPointerDown={(event) => handleTablePointerDown(instance, event)}
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
            onHover={onRelationHover}
            onLeave={onRelationLeave}
          />
        );
      })}
    </>
  );
}

interface SceneProps {
  graph: SchemaGraph;
  activeTable?: string;
  onSelect: (table: string) => void;
  isLayoutEditing: boolean;
  onLayoutChange: (tableName: string, position: [number, number, number], options?: { lockZ?: boolean }) => void;
}

export function Scene3D({ graph, activeTable, onSelect, isLayoutEditing, onLayoutChange }: SceneProps) {
  const cameraPosition = useMemo(() => [0, 16, 0.001] as [number, number, number], []);
  const domainColorMap = useMemo(() => buildDomainColorMap(graph.tables), [graph.tables]);
  const [hoveredRelation, setHoveredRelation] = useState<{
    relation: Relation;
    pointer: { x: number; y: number };
  } | null>(null);
  const [dragFeedback, setDragFeedback] = useState<DragFeedback>(null);

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

        <SceneContent
          graph={graph}
          activeTable={activeTable}
          onSelect={onSelect}
          domainColorMap={domainColorMap}
          onRelationHover={handleRelationHover}
          onRelationLeave={handleRelationLeave}
          isLayoutEditing={isLayoutEditing}
          onLayoutChange={onLayoutChange}
          onDragFeedbackChange={setDragFeedback}
        />
      </Canvas>

      {Object.entries(domainColorMap).length > 0 && (
        <div className="schema-legend">
          <div className="schema-legend__title">Domains</div>
          <div className="schema-legend__list">
            {Object.entries(domainColorMap).map(([domain, colors]) => (
              <div key={domain} className="schema-legend__item">
                <span className="schema-legend__swatch" style={{ background: colors.fill }} />
                <span>{domain}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dragFeedback && (
        <div className={`drag-feedback ${dragFeedback.isError ? 'drag-feedback--error' : ''}`}>
          {dragFeedback.message}
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
