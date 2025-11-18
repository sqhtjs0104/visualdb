export type Column = {
  name: string;
  type: string;
  nullable: boolean;
  default?: string | number | boolean | null;
  isPrimary?: boolean;
  isUnique?: boolean;
  isIndexed?: boolean;
  comment?: string;
  foreignKey?: {
    table: string;
    column: string;
    onUpdate?: string;
    onDelete?: string;
  };
};

export type Index = {
  name: string;
  columns: string[];
  unique: boolean;
  type?: string;
};

export type Relation = {
  name: string;
  fromTable: string;
  fromColumns: string[];
  toTable: string;
  toColumns: string[];
  onUpdate?: string;
  onDelete?: string;
};

export type Table = {
  name: string;
  schema: string;
  columns: Column[];
  primaryKey: string[];
  indexes: Index[];
  relations: Relation[];
  rowEstimate?: number;
  comment?: string;
};

export type LayoutNode = {
  x: number;
  y: number;
  z: number;
};

export type Layout = {
  nodes: Record<string, LayoutNode>;
};

export type SchemaGraph = {
  schema: string;
  tables: Table[];
  relations: Relation[];
  layout?: Layout;
};
