"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderService = exports.OrderService = exports.memoryPubSub = void 0;
const uuid_1 = require("uuid");
const storage_service_1 = require("./storage.service");
const redis_1 = require("../config/redis");
// Explicitly using a simple event emitter for In-Memory PubSub if Redis fails
const events_1 = require("events");
exports.memoryPubSub = new events_1.EventEmitter();
class OrderService {
    async createOrder(req) {
        const id = (0, uuid_1.v4)();
        const now = new Date();
        const order = {
            id,
            ...req,
            status: 'pending',
            createdAt: now,
            updatedAt: now,
            logs: [`Order received at ${now.toISOString()}`]
        };
        await storage_service_1.storage.saveOrder(order);
        return order;
    }
    async updateStatus(id, status, log, extra) {
        const order = await storage_service_1.storage.getOrder(id);
        if (!order)
            return;
        order.status = status;
        order.updatedAt = new Date();
        if (log)
            order.logs.push(log);
        if (extra)
            Object.assign(order, extra);
        await storage_service_1.storage.updateOrder(order);
        // Publish event
        const payload = JSON.stringify({ id, status, logs: order.logs, txHash: order.txHash });
        if (redis_1.isRedisConnected && redis_1.redisPub) {
            await redis_1.redisPub.publish('order-updates', payload);
        }
        else {
            exports.memoryPubSub.emit('order-updates', payload);
        }
    }
    async getOrder(id) {
        return storage_service_1.storage.getOrder(id);
    }
}
exports.OrderService = OrderService;
exports.orderService = new OrderService();
