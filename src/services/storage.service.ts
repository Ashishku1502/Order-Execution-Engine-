import { DexQuote, Order } from '../types';
import { logger } from '../utils/logger';

export interface IStorageService {
    saveOrder(order: Order): Promise<void>;
    getOrder(id: string): Promise<Order | null>;
    updateOrder(order: Order): Promise<void>;
}

// In-Memory Implementation
class InMemoryStorage implements IStorageService {
    private orders = new Map<string, Order>();

    async saveOrder(order: Order): Promise<void> {
        this.orders.set(order.id, { ...order }); // Clone
    }

    async getOrder(id: string): Promise<Order | null> {
        const order = this.orders.get(id);
        return order ? { ...order } : null;
    }

    async updateOrder(order: Order): Promise<void> {
        this.orders.set(order.id, { ...order });
    }
}

// DB Implementation (Postgres + Redis Cache)
import { query } from '../config/db';
import { redisConnection } from '../config/redis';

class PostgresStorage implements IStorageService {
    async saveOrder(order: Order): Promise<void> {
        const sql = `
            INSERT INTO orders (id, type, token_in, token_out, amount, status, logs, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        `;
        await query(sql, [
            order.id, order.type, order.tokenIn, order.tokenOut, order.amount,
            order.status, JSON.stringify(order.logs), order.createdAt, order.updatedAt
        ]);

        // Cache
        if (redisConnection) {
            await redisConnection.set(`order:${order.id}`, JSON.stringify(order), 'EX', 3600);
        }
    }

    async getOrder(id: string): Promise<Order | null> {
        // Try cache
        if (redisConnection) {
            const cached = await redisConnection.get(`order:${id}`);
            if (cached) return JSON.parse(cached);
        }

        const res = await query('SELECT * FROM orders WHERE id = $1', [id]);
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

    async updateOrder(order: Order): Promise<void> {
        // Update DB
        const sql = `
            UPDATE orders SET status = $1, logs = $2, updated_at = $3, tx_hash = $4, executed_price = $5 WHERE id = $6
        `;
        await query(sql, [
            order.status, JSON.stringify(order.logs), order.updatedAt, order.txHash || null, order.executedPrice || null, order.id
        ]);

        // Update Cache
        if (redisConnection) {
            await redisConnection.set(`order:${order.id}`, JSON.stringify(order), 'EX', 3600);
        }
    }
}

export let storage: IStorageService;

export const initStorage = (useDb: boolean) => {
    storage = useDb ? new PostgresStorage() : new InMemoryStorage();
    logger.info(`Storage initialized with ${useDb ? 'PostgreSQL' : 'In-Memory'}`);
};
