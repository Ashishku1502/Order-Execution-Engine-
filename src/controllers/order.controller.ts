import { FastifyRequest, FastifyReply } from 'fastify';
// import { SocketStream } from '@fastify/websocket'; // Type issue in some versions
import { orderService } from '../services/order.service';
import { orderQueue } from '../services/queue.service';
import { OrderRequest } from '../types';
import { redisSub } from '../config/redis';
import { logger } from '../utils/logger';
import { memoryPubSub } from '../services/order.service';

export const executeOrder = async (req: FastifyRequest<{ Body: OrderRequest }>, reply: FastifyReply) => {
    try {
        const { type, tokenIn, tokenOut, amount } = req.body;
        // Validation
        if (!type || !tokenIn || !tokenOut || !amount) {
            return reply.status(400).send({ error: 'Missing required fields' });
        }

        // 1. Create Order
        const order = await orderService.createOrder({ type, tokenIn, tokenOut, amount });

        // 2. Add to Queue
        await orderQueue.add('execute-order', { orderId: order.id });

        return reply.status(202).send({ orderId: order.id, status: 'queued', message: 'Order submitted successfully' });
    } catch (error: any) {
        logger.error('Execute order error', error);
        return reply.status(500).send({ error: 'Internal Server Error' });
    }
};

export const orderWebSocket = (connection: any, req: FastifyRequest) => {
    const { orderId } = req.query as { orderId: string };

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

    logger.info(`WS connected for order ${orderId}`);

    // Send current status immediately
    orderService.getOrder(orderId).then(order => {
        if (order) {
            connection.socket.send(JSON.stringify({
                type: 'initial_state',
                data: order
            }));
        }
    });

    // Event Handler
    const onMessage = (payload: any) => {
        // Normalize payload: Redis sends string, Memory sends string or object?
        // We unified strictly to string JSON in order.service
        let update;
        try {
            update = typeof payload === 'string' ? JSON.parse(payload) : payload;
        } catch (e) { return; }

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

    const redisHandler = (channel: string, msg: string) => {
        if (channel === 'order-updates') onMessage(msg);
    };

    if (redisSub && redisSub.status === 'ready') {
        redisSub.on('message', redisHandler);
        connection.socket.on('close', () => {
            logger.info(`WS closed for order ${orderId}`);
            if (redisSub) redisSub.removeListener('message', redisHandler);
        });
    } else {
        // Use memory pubsub
        const memoryHandler = (msg: string) => onMessage(msg);
        memoryPubSub.on('order-updates', memoryHandler);
        connection.socket.on('close', () => {
            logger.info(`WS closed for order ${orderId}`);
            memoryPubSub.removeListener('order-updates', memoryHandler);
        });
    }
};
