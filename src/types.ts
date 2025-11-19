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
  domain: string;
  columns: Column[];
  primaryKey: string[];
  indexes: Index[];
  rowEstimate?: number;
  comment?: string;
};

export type Position = {
  x: number;
  y: number;
  z: number;
};

export type ScenarioStep = {
  order: number;
  description: string;
};

export type Scenario = {
  id: string;
  name: string;
  tableNames: string[];
  steps?: ScenarioStep[];
  description?: string;
};

export type SchemaGraph = {
  tables: Table[];
  relations: Relation[];
  positions?: Record<string, Position>;
  scenarios?: Scenario[];
};