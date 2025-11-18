# VisualDB Architecture Draft

## 1. Common DTOs

### Table
- `name` (string): Logical table name.
- `schema` (string): Owning schema/database name.
- `columns` (Column[]): Ordered list of columns.
- `primaryKey` (string[]): Column names forming the primary key.
- `indexes` (Index[]): Secondary indexes, excluding the primary key.
- `relations` (Relation[]): Outgoing relations referencing other tables.
- `rowEstimate` (number, optional): Approximate row count for sizing in the 3D layout.
- `comment` (string, optional): Free-form description.

### Column
- `name` (string)
- `type` (string): Database type (e.g., `varchar(255)`, `int`).
- `nullable` (boolean)
- `default` (string | number | boolean | null, optional)
- `isPrimary` (boolean): Convenience flag mirroring `primaryKey` membership.
- `isUnique` (boolean)
- `isIndexed` (boolean)
- `comment` (string, optional)

### Relation (Foreign Key)
- `name` (string): Constraint name.
- `fromTable` (string): Source table name.
- `fromColumns` (string[]): Columns in the source table.
- `toTable` (string): Target table name.
- `toColumns` (string[]): Referenced columns in the target table.
- `onUpdate` (string, optional): Update rule (e.g., `CASCADE`).
- `onDelete` (string, optional): Delete rule.

### Index
- `name` (string)
- `columns` (string[]): Ordered columns in the index definition.
- `unique` (boolean)
- `type` (string, optional): Index type (e.g., `BTREE`, `HASH`).

### GraphMeta
- `version` (string): Monotonic graph version for cache validation.
- `layout` (object): Precomputed layout coordinates keyed by table name.
  - `nodes` (object): `{ [tableName: string]: { x: number, y: number, z: number } }`
  - `edges` (object): `{ [relationName: string]: { points: [ { x, y, z } ] } }`
- `updatedAt` (ISO datetime): Server-side timestamp when the graph snapshot was produced.
- `etag` (string, optional): ETag derived from the version+layout payload.

## 2. API Spec (Draft)

### `GET /schemas`
Returns known schemas plus freshness metadata.

**200 OK**
```json
{
  "schemas": [
    { "name": "ecommerce", "displayName": "E-Commerce", "version": "2024-06-01T12:00:00Z" },
    { "name": "analytics", "displayName": "Analytics Warehouse", "version": "2024-06-02T09:30:00Z" }
  ],
  "count": 2
}
```

### `GET /schemas/:schema/graph`
Returns the graph DTO for a single schema.

**200 OK**
```json
{
  "schema": "ecommerce",
  "graph": {
    "tables": [
      {
        "name": "orders",
        "schema": "ecommerce",
        "primaryKey": ["id"],
        "columns": [
          { "name": "id", "type": "bigint", "nullable": false, "isPrimary": true, "isUnique": true, "isIndexed": true },
          { "name": "user_id", "type": "bigint", "nullable": false, "isIndexed": true },
          { "name": "created_at", "type": "timestamp", "nullable": false }
        ],
        "indexes": [
          { "name": "idx_orders_user", "columns": ["user_id"], "unique": false, "type": "BTREE" }
        ],
        "relations": [
          { "name": "fk_orders_user", "fromTable": "orders", "fromColumns": ["user_id"], "toTable": "users", "toColumns": ["id"], "onDelete": "CASCADE" }
        ],
        "rowEstimate": 1250000
      }
    ],
    "relations": [
      { "name": "fk_orders_user", "fromTable": "orders", "fromColumns": ["user_id"], "toTable": "users", "toColumns": ["id"], "onDelete": "CASCADE" }
    ],
    "graphMeta": {
      "version": "2024-06-02T09:30:00Z",
      "etag": "W/\"ecommerce-20240602T0930\"",
      "updatedAt": "2024-06-02T09:30:00Z",
      "layout": {
        "nodes": {
          "orders": { "x": 0, "y": 0, "z": 0 },
          "users": { "x": 4, "y": 1, "z": -2 }
        },
        "edges": {
          "fk_orders_user": { "points": [ { "x": 0, "y": 0, "z": 0 }, { "x": 4, "y": 1, "z": -2 } ] }
        }
      }
    }
  }
}
```

**304 Not Modified**
- Returned when `If-None-Match` or `If-Modified-Since` matches `graphMeta.etag` or `graphMeta.version`.

### `POST /schemas/:schema/refresh`
Triggers metadata refresh for the schema.

**202 Accepted**
```json
{ "schema": "ecommerce", "status": "refreshing", "requestedAt": "2024-06-02T10:00:00Z" }
```

**429 Too Many Requests**
- Returned when a refresh is already in progress; response includes `retryAfterSeconds`.

## 3. Database Extensibility

### SchemaProvider Interface (draft)
- `listSchemas(): Promise<SchemaSummary[]>`
- `getSchemaGraph(schema: string, options?: { useCache: boolean }): Promise<SchemaGraph>`
- `refreshSchema(schema: string): Promise<RefreshStatus>`
- `supports(schema: string): boolean` (optional hint for multi-tenant providers)

Types reuse the DTOs above for tables, columns, relations, indexes, and `GraphMeta`.

### MySQL Provider Responsibilities
- Connect via a read-only, metadata-only account; no data access required.
- Map `information_schema` tables to DTOs (tables, columns, indexes, constraints, row estimates via `TABLE_ROWS`).
- Normalize types (e.g., `varchar(255)`, `int`, `decimal(p,s)`) and nullability flags.
- Resolve foreign keys with update/delete rules.
- Generate deterministic `version`/`etag` from metadata hashes and `updatedAt` timestamp.
- Cache results per schema; honor `useCache` flag to bypass cache.
- Optionally enrich layout hints (e.g., grouping tables by database or engine).

## 4. 3D UX Requirements
- Scale target: ~200 tables and ~400 relations per scene while maintaining 60fps on modern laptops.
- Interactions: orbit/zoom/pan camera, select tables/relations, expand/collapse neighbor tables, focus path between two tables, and drag nodes in manual layout mode.
- Highlights: hover outlines tables/edges; selection locks highlights and dims unrelated nodes; show relation directionality.
- Tooltips: show table name, row estimate, and primary key on hover; show column details when hovering a column list preview.
- Info Panel: pinned table details including columns (type, PK/unique/index flags), indexes, inbound/outbound relations, row estimate, and comments.
- Search/Filter: quick search by table/column name; filter by schema or tag; toggle hiding isolated tables.

## 5. Update & Cache Strategy
- Each `graphMeta` includes `version` and `etag` fields; clients send conditional requests (`If-None-Match`, `If-Modified-Since`).
- Full reload occurs when `version` changes; partial updates may be applied when only layout or row estimates change.
- Server maintains per-schema cache with TTL; `refreshSchema` invalidates cache and triggers recomputation.
- Client caches last graph by `schema` and `version`; falling back to full reload when applying partial patch fails validation.

## 6. Security & Operations Guide (Draft)
- Environment variables: `VISUALDB_DB_URL`, `VISUALDB_DB_USER`, `VISUALDB_DB_PASSWORD`, `VISUALDB_CACHE_TTL_SECONDS`, `VISUALDB_RATE_LIMIT_RPS`, `VISUALDB_LOG_LEVEL`, `VISUALDB_ALLOWED_ORIGINS`.
- Minimum-privilege DB account: read-only access to `information_schema` and metadata views; no DML/DDL; optional resource group to cap CPU/IO.
- Logging defaults: structured JSON, request IDs, and redaction for secrets; retain 7–14 days.
- Rate limiting defaults: 50 RPS per IP with burst of 100; stricter (5 RPS) on `/refresh`.
- Transport security: enforce TLS for all external endpoints; disable plaintext credentials.
- Access control: optional API token via `VISUALDB_API_TOKEN`; audit refresh requests with requester identity and timestamp.

## 7. Next Steps Checklist
- **DTO validation**: Freeze field names/types and publish JSON Schema for `Table`, `Column`, `Relation`, `Index`, and `GraphMeta` so frontends/backend agree on casing and nullability.
- **Provider contract**: Codify `SchemaProvider` in code (TypeScript or Go) with docs on error codes/timeouts; ship a stub MySQL provider that hits `information_schema` and returns mock data for local testing.
- **Caching & refresh flow**: Implement ETag/version headers on `/schemas/:schema/graph`, persist layout+metadata in cache storage (e.g., Redis), and wire `/refresh` to invalidate and enqueue recomputation.
- **Graph layout pipeline**: Choose a force-directed or layered layout algorithm, persist coordinates into `graphMeta.layout`, and allow client overrides while retaining server defaults.
- **3D UX prototype**: Build a minimal scene that loads one sample graph, supports orbit/zoom/pan, table selection/highlights, and shows tooltip + info panel stubs with DTO-backed fields.
- **Security hardening**: Add API token middleware, structured logging with request IDs, and per-route rate limits; document env var defaults in README.
- **Performance envelope**: Load-test rendering and backend responses against ~200 tables/400 relations to validate the 60fps and latency targets; adjust pagination or lazy-loading if necessary.
