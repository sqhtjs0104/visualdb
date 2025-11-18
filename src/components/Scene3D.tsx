import React, { useCallback, useEffect, useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { Line, OrbitControls, PerspectiveCamera } from '@react-three/drei';
import { SchemaGraph, Table } from '../types';

type TableInstance = {
  table: Table;
  position: [number, number, number];
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

function TableBox({ table, position, isActive, onSelect }: TableInstance & { isActive: boolean; onSelect: () => void }) {
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
    <group position={position} onClick={onSelect} onPointerOver={handlePointerOver} onPointerOut={handlePointerOut}>
      <mesh castShadow receiveShadow>
        <boxGeometry args={[1.7, 0.9, 1.3]} />
        <meshStandardMaterial color={isActive ? '#4f46e5' : '#475569'} emissive={isActive ? '#4338ca' : '#1f2937'} opacity={0.92} transparent />
      </mesh>
      <mesh position={[0, 0.55, 0]}>
        <planeGeometry args={[1.55, 1.05]} />
        <meshBasicMaterial color="#0f172a" transparent opacity={0.72} />
      </mesh>
      <mesh position={[0, 0.56, 0]}>
        <planeGeometry args={[1.55, 1.05]} />
        <meshBasicMaterial color="transparent" />
      </mesh>
    </group>
  );
}

function RelationEdge({
  from,
  to,
  isConnected,
  hasSelection,
}: {
  from: [number, number, number];
  to: [number, number, number];
  isConnected: boolean;
  hasSelection: boolean;
}) {
  const mid: [number, number, number] = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2 + 0.2, (from[2] + to[2]) / 2];
  const opacity = isConnected ? 0.9 : hasSelection ? 0.12 : 0.2;
  const width = isConnected ? 2.6 : 1.6;
  return <Line points={[from, mid, to]} color="#c4b5fd" lineWidth={width} transparent opacity={opacity} />;
}

interface SceneProps {
  graph: SchemaGraph;
  activeTable?: string;
  onSelect: (table: string) => void;
}

export function Scene3D({ graph, activeTable, onSelect }: SceneProps) {
  const instances = useTableInstances(graph);
  const nodeLookup = useMemo(() => Object.fromEntries(instances.map((i) => [i.table.name, i.position])), [instances]);

  return (
    <Canvas shadows className="canvas-wrapper">
      <color attach="background" args={["#0d1117"]} />
      <hemisphereLight intensity={0.4} groundColor="#0f172a" />
      <directionalLight position={[8, 12, 6]} intensity={0.85} castShadow />
      <PerspectiveCamera makeDefault position={[8, 10, 12]} />
      <OrbitControls enablePan enableRotate enableZoom />

      {instances.map((instance) => (
        <TableBox
          key={instance.table.name}
          {...instance}
          isActive={activeTable === instance.table.name}
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
          />
        );
      })}
    </Canvas>
  );
}
