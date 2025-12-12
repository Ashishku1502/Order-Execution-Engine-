"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.orderWebSocket = exports.executeOrder = void 0;
// import { SocketStream } from '@fastify/websocket'; // Type issue in some versions
const order_service_1 = require("../services/order.service");
const queue_service_1 = require("../services/queue.service");
const redis_1 = require("../config/redis");
const logger_1 = require("../utils/logger");
const order_service_2 = require("../services/order.service");
const executeOrder = async (req, reply) => {
    try {
        const { type, tokenIn, tokenOut, amount } = req.body;
        // Validation
        if (!type || !tokenIn || !tokenOut || !amount) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }
        // 1. Create Order
        const order = await order_service_1.orderService.createOrder({ type, tokenIn, tokenOut, amount });
        // 2. Add to Queue
        await queue_service_1.orderQueue.add('execute-order', { orderId: order.id });
        return reply.status(202).send({ orderId: order.id, status: 'queued', message: 'Order submitted successfully' });
    }
    catch (error) {
        logger_1.logger.error('Execute order error', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
};
exports.executeOrder = executeOrder;
const orderWebSocket = (connection, req) => {
    const { orderId } = req.query;
    // Since "Single endpoint handles both protocols" might be tricky if we want `POST /execute` to return ID and `WS /execute` to stream.
    // If the client connects to WS without orderId, we can't show much.
    // Usually client calls POST -> gets ID -> calls WS URL with ID.
    // If the requirement strictly means "Same HTTP connection upgrades to WebSocket" directly after POST, that's non-standard for APIs returning JSON.
    // I will assume the standard flow: POST returns ID, then client connects WS with ID.
    if (!orderId) {
        connection.socket.send(JSON.stringify({ error: 'orderId query param required' }));
        connection.socket.close();
        return;
    }
    logger_1.logger.info(`WS connected for order ${orderId}`);
    // Send current status immediately
    order_service_1.orderService.getOrder(orderId).then(order => {
        if (order) {
            connection.socket.send(JSON.stringify({
                type: 'initial_state',
                data: order
            }));
        }
    });
    // Event Handler
    const onMessage = (payload) => {
        // Normalize payload: Redis sends string, Memory sends string or object?
        // We unified strictly to string JSON in order.service
        let update;
        try {
            update = typeof payload === 'string' ? JSON.parse(payload) : payload;
        }
        catch (e) {
            return;
        }
        if (update.id === orderId) {
            connection.socket.send(JSON.stringify({
                type: 'update',
                data: update
            }));
            if (update.status === 'confirmed' || update.status === 'failed') {
                // optional cleanup
            }
        }
    };
    const redisHandler = (channel, msg) => {
        if (channel === 'order-updates')
            onMessage(msg);
    };
    if (redis_1.redisSub && redis_1.redisSub.status === 'ready') {
        redis_1.redisSub.on('message', redisHandler);
        connection.socket.on('close', () => {
            logger_1.logger.info(`WS closed for order ${orderId}`);
            if (redis_1.redisSub)
                redis_1.redisSub.removeListener('message', redisHandler);
        });
    }
    else {
        // Use memory pubsub
        const memoryHandler = (msg) => onMessage(msg);
        order_service_2.memoryPubSub.on('order-updates', memoryHandler);
        connection.socket.on('close', () => {
            logger_1.logger.info(`WS closed for order ${orderId}`);
            order_service_2.memoryPubSub.removeListener('order-updates', memoryHandler);
        });
    }
};
exports.orderWebSocket = orderWebSocket;
