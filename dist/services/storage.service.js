"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initStorage = exports.storage = void 0;
const logger_1 = require("../utils/logger");
// In-Memory Implementation
class InMemoryStorage {
    constructor() {
        this.orders = new Map();
    }
    async saveOrder(order) {
        this.orders.set(order.id, { ...order }); // Clone
    }
    async getOrder(id) {
        const order = this.orders.get(id);
        return order ? { ...order } : null;
    }
    async updateOrder(order) {
        this.orders.set(order.id, { ...order });
    }
}
// DB Implementation (Postgres + Redis Cache)
const db_1 = require("../config/db");
const redis_1 = require("../config/redis");
class PostgresStorage {
    async saveOrder(order) {
        const sql = `
            INSERT INTO orders (id, type, token_in, token_out, amount, status, logs, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await (0, db_1.query)(sql, [
            order.id, order.type, order.tokenIn, order.tokenOut, order.amount,
            order.status, JSON.stringify(order.logs), order.createdAt, order.updatedAt
        ]);
        // Cache
        if (redis_1.redisConnection) {
            await redis_1.redisConnection.set(`order:${order.id}`, JSON.stringify(order), 'EX', 3600);
        }
    }
    async getOrder(id) {
        // Try cache
        if (redis_1.redisConnection) {
            const cached = await redis_1.redisConnection.get(`order:${id}`);
            if (cached)
                return JSON.parse(cached);
        }
        const res = await (0, db_1.query)('SELECT * FROM orders WHERE id = $1', [id]);
        if (res.rows.length > 0) {
            const row = res.rows[0];
            return {
                id: row.id,
                type: row.type,
                tokenIn: row.token_in,
                tokenOut: row.token_out,
                amount: parseFloat(row.amount),
                status: row.status,
                logs: row.logs,
                txHash: row.tx_hash,
                executedPrice: row.executed_price ? parseFloat(row.executed_price) : undefined,
                createdAt: row.created_at,
                updatedAt: row.updated_at
            };
        }
        return null;
    }
    async updateOrder(order) {
        // Update DB
        const sql = `
            UPDATE orders SET status = $1, logs = $2, updated_at = $3, tx_hash = $4, executed_price = $5 WHERE id = $6
        `;
        await (0, db_1.query)(sql, [
            order.status, JSON.stringify(order.logs), order.updatedAt, order.txHash || null, order.executedPrice || null, order.id
        ]);
        // Update Cache
        if (redis_1.redisConnection) {
            await redis_1.redisConnection.set(`order:${order.id}`, JSON.stringify(order), 'EX', 3600);
        }
    }
}
const initStorage = (useDb) => {
    exports.storage = useDb ? new PostgresStorage() : new InMemoryStorage();
    logger_1.logger.info(`Storage initialized with ${useDb ? 'PostgreSQL' : 'In-Memory'}`);
};
exports.initStorage = initStorage;
