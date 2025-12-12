import { OrderRequest, Order, OrderStatus } from '../types';
import { v4 as uuidv4 } from 'uuid';
import { storage } from './storage.service';
import { redisPub, isRedisConnected } from '../config/redis';
// Explicitly using a simple event emitter for In-Memory PubSub if Redis fails
import { EventEmitter } from 'events';

export const memoryPubSub = new EventEmitter();

export class OrderService {
    async createOrder(req: OrderRequest): Promise<Order> {
        const id = uuidv4();
        const now = new Date();
        const order: Order = {
            id,
            ...req,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            logs: [`Order received at ${now.toISOString()}`]
        };

        await storage.saveOrder(order);
        return order;
    }

    async updateStatus(id: string, status: OrderStatus, log?: string, extra?: Partial<Order>) {
        const order = await storage.getOrder(id);
        if (!order) return;

        order.status = status;
        order.updatedAt = new Date();
        if (log) order.logs.push(log);
        if (extra) Object.assign(order, extra);

        await storage.updateOrder(order);

        // Publish event
        const payload = JSON.stringify({ id, status, logs: order.logs, txHash: order.txHash });
        if (isRedisConnected && redisPub) {
            await redisPub.publish('order-updates', payload);
        } else {
            memoryPubSub.emit('order-updates', payload);
        }
    }

    async getOrder(id: string): Promise<Order | null> {
        return storage.getOrder(id);
    }
}

export const orderService = new OrderService();
