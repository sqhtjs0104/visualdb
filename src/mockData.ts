import { SchemaGraph } from './types';

export const mockGraph: SchemaGraph = {
  tables: [
    {
      name: 'users',
      domain: 'ecommerce',
      primaryKey: ['id'],
      rowEstimate: 120000,
      comment: 'Registered shoppers',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isIndexed: true },
        { name: 'email', type: 'varchar(255)', nullable: false, isUnique: true, isIndexed: true },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
      indexes: [
        { name: 'pk_users', columns: ['id'], unique: true },
        { name: 'ux_users_email', columns: ['email'], unique: true },
      ],
    },
    {
      name: 'orders',
      domain: 'ecommerce',
      primaryKey: ['id'],
      rowEstimate: 1250000,
      comment: 'Purchases placed in the shop',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isIndexed: true },
        { name: 'user_id', type: 'bigint', nullable: false, isIndexed: true },
        { name: 'total', type: 'decimal(10,2)', nullable: false },
        { name: 'created_at', type: 'timestamp', nullable: false },
      ],
      indexes: [
        { name: 'pk_orders', columns: ['id'], unique: true },
        { name: 'idx_orders_user', columns: ['user_id'], unique: false },
      ],
    },
    {
      name: 'order_items',
      domain: 'ecommerce',
      primaryKey: ['id'],
      rowEstimate: 2750000,
      comment: 'Line items purchased per order',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isIndexed: true },
        { name: 'order_id', type: 'bigint', nullable: false, isIndexed: true },
        { name: 'product_id', type: 'bigint', nullable: false, isIndexed: true },
        { name: 'quantity', type: 'int', nullable: false },
      ],
      indexes: [
        { name: 'pk_order_items', columns: ['id'], unique: true },
        { name: 'idx_order_items_order', columns: ['order_id'], unique: false },
      ],
    },
    {
      name: 'products',
      domain: 'ecommerce',
      primaryKey: ['id'],
      rowEstimate: 68000,
      comment: 'Sellable catalog items',
      columns: [
        { name: 'id', type: 'bigint', nullable: false, isPrimary: true, isIndexed: true },
        { name: 'sku', type: 'varchar(64)', nullable: false, isUnique: true, isIndexed: true },
        { name: 'name', type: 'varchar(255)', nullable: false },
        { name: 'price', type: 'decimal(10,2)', nullable: false },
      ],
      indexes: [
        { name: 'pk_products', columns: ['id'], unique: true },
        { name: 'ux_products_sku', columns: ['sku'], unique: true },
      ],
    },
  ],
  relations: [
    {
      name: 'fk_orders_user',
      fromTable: 'orders',
      fromColumns: ['user_id'],
      toTable: 'users',
      toColumns: ['id'],
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_order_items_order',
      fromTable: 'order_items',
      fromColumns: ['order_id'],
      toTable: 'orders',
      toColumns: ['id'],
      onUpdate: 'CASCADE',
      onDelete: 'CASCADE',
    },
    {
      name: 'fk_order_items_product',
      fromTable: 'order_items',
      fromColumns: ['product_id'],
      toTable: 'products',
      toColumns: ['id'],
      onUpdate: 'NO ACTION',
      onDelete: 'RESTRICT',
    },
  ],
  positions: {
    users: { x: -4, y: 1, z: -2 },
    orders: { x: 0, y: 0, z: 0 },
    order_items: { x: 4, y: 0, z: 1 },
    products: { x: 2, y: 2, z: -2 },
  },
  scenarios: [
    {
      id: 'scenario-1',
      name: '고객 주문 여정',
      tableNames: ['users', 'orders', 'order_items', 'products'],
      steps: [
        { order: 1, description: '고객 계정 조회' },
        { order: 2, description: '주문 기록 확인' },
        { order: 3, description: '주문별 상품 구성 검토' },
        { order: 4, description: '배송 준비 및 상태 추적' },
      ],
    },
    {
      id: 'scenario-2',
      name: '상품 관리 플로우',
      tableNames: ['products'],
      steps: [
        { order: 1, description: '신규 상품 등록' },
        { order: 2, description: '가격 및 SKU 점검' },
        { order: 3, description: '재고 보충 및 판매 중지 처리' },
      ],
    },
  ],
};
