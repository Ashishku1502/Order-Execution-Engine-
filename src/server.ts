import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import dotenv from 'dotenv';
import orderRoutes from './routes/order.routes';
import { redisSub, checkRedisConnection, initRedisClients } from './config/redis';
import { checkDbConnection } from './config/db';
import { logger } from './utils/logger';
import { initStorage } from './services/storage.service';
import { initQueue, orderQueue } from './services/queue.service';
import { memoryPubSub, orderService } from './services/order.service';

dotenv.config();

const fastify = Fastify({ logger: true });

const start = async () => {
    try {
        await fastify.register(cors);
        await fastify.register(websocket);

        // Check Connections
        const isPgConnected = await checkDbConnection();
        initRedisClients();
        const isRedisConnected = await checkRedisConnection();

        // Init Services based on connections
        initStorage(isPgConnected); // If PG fails, use Memory
        initQueue(isRedisConnected); // If Redis fails, use Memory

        // Register Routes
        await fastify.register(orderRoutes, { prefix: '/api/orders' });

        // Health & Root Routes
        fastify.get('/', async () => ({ status: 'ok', service: 'Order Execution Engine' }));
        fastify.get('/health', async () => ({
            status: 'ok',
            uptime: process.uptime(),
            connections: {
                database: isPgConnected ? 'PostgreSQL' : 'In-Memory',
                queue: isRedisConnected ? 'Redis' : 'In-Memory'
            }
        }));

        // Setup WebSocket Listener
        if (isRedisConnected && redisSub) {
            await redisSub.subscribe('order-updates');
            logger.info('Subscribed to order-updates redis channel');

            // Bridge Redis messages to a handler
            // Note: We need to make sure the ws handler attaches validation
        } else {
            logger.info('Using Memory PubSub for WebSockets');
        }

        const port = parseInt(process.env.PORT || '3000');
        await fastify.listen({ port, host: '0.0.0.0' });
        logger.info(`Server running on port ${port}`);

        const shutdown = async () => {
            logger.info('Shutting down...');
            await fastify.close();
            if (isRedisConnected) {
                // await redisSub?.quit();
            }
            orderQueue.stop();
            process.exit(0);
        };

        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);

    } catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};

start();
