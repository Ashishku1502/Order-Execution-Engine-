"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fastify_1 = __importDefault(require("fastify"));
const websocket_1 = __importDefault(require("@fastify/websocket"));
const cors_1 = __importDefault(require("@fastify/cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const order_routes_1 = __importDefault(require("./routes/order.routes"));
const redis_1 = require("./config/redis");
const db_1 = require("./config/db");
const logger_1 = require("./utils/logger");
const storage_service_1 = require("./services/storage.service");
const queue_service_1 = require("./services/queue.service");
dotenv_1.default.config();
const fastify = (0, fastify_1.default)({ logger: true });
const start = async () => {
    try {
        await fastify.register(cors_1.default);
        await fastify.register(websocket_1.default);
        // Check Connections
        const isPgConnected = await (0, db_1.checkDbConnection)();
        (0, redis_1.initRedisClients)();
        const isRedisConnected = await (0, redis_1.checkRedisConnection)();
        // Init Services based on connections
        (0, storage_service_1.initStorage)(isPgConnected); // If PG fails, use Memory
        (0, queue_service_1.initQueue)(isRedisConnected); // If Redis fails, use Memory
        // Register Routes
        await fastify.register(order_routes_1.default, { prefix: '/api/orders' });
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
        if (isRedisConnected && redis_1.redisSub) {
            await redis_1.redisSub.subscribe('order-updates');
            logger_1.logger.info('Subscribed to order-updates redis channel');
            // Bridge Redis messages to a handler
            // Note: We need to make sure the ws handler attaches validation
        }
        else {
            logger_1.logger.info('Using Memory PubSub for WebSockets');
        }
        const port = parseInt(process.env.PORT || '3000');
        await fastify.listen({ port, host: '0.0.0.0' });
        logger_1.logger.info(`Server running on port ${port}`);
        const shutdown = async () => {
            logger_1.logger.info('Shutting down...');
            await fastify.close();
            if (isRedisConnected) {
                // await redisSub?.quit();
            }
            queue_service_1.orderQueue.stop();
            process.exit(0);
        };
        process.on('SIGINT', shutdown);
        process.on('SIGTERM', shutdown);
    }
    catch (err) {
        fastify.log.error(err);
        process.exit(1);
    }
};
start();
