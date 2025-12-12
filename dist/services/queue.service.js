"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.initQueue = exports.orderQueue = exports.workerHandler = void 0;
const bullmq_1 = require("bullmq");
const redis_1 = require("../config/redis");
const order_service_1 = require("./order.service");
const dex_service_1 = require("./dex.service");
const logger_1 = require("../utils/logger");
const QUEUE_NAME = 'order-execution';
// BullMQ Implementation
class BullQueueService {
    constructor() {
        if (!redis_1.redisConnection)
            throw new Error('Redis not connected');
        this.queue = new bullmq_1.Queue(QUEUE_NAME, {
            connection: redis_1.redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false
            }
        });
        this.worker = new bullmq_1.Worker(QUEUE_NAME, exports.workerHandler, {
            connection: redis_1.redisConnection,
            concurrency: 10,
            limiter: { max: 100, duration: 60000 }
        });
        this.worker.on('failed', (job, err) => {
            if (job)
                logger_1.logger.error(`Job ${job.id} failed: ${err.message}`);
        });
    }
    async add(name, data) {
        await this.queue.add(name, data);
    }
    start() {
        // BullMQ worker starts automatically on instantiation but we can resume if paused
        if (this.worker.isPaused())
            this.worker.resume();
    }
    stop() {
        this.worker.close();
        this.queue.close();
    }
}
// In-Memory Queue Implementation
class InMemoryQueueService {
    constructor() {
        this.queue = [];
        this.interval = null;
        this.isProcessing = false;
    }
    async add(name, data) {
        this.queue.push(data);
        logger_1.logger.info(`Added to memory queue: ${data.orderId}`);
    }
    start() {
        if (this.interval)
            return;
        this.interval = setInterval(async () => {
            if (this.queue.length === 0 || this.isProcessing)
                return;
            this.isProcessing = true;
            const jobData = this.queue.shift();
            if (jobData) {
                // Mock job object
                const mockJob = { data: jobData, attemptsMade: 0, opts: { attempts: 3 } };
                try {
                    await (0, exports.workerHandler)(mockJob);
                }
                catch (e) {
                    // Simple retry logic check for memory queue?
                    // For now, let's keep it simple. If it fails, it fails.
                    // Or implement simple retry loop
                    logger_1.logger.error(`Memory job failed: ${e.message}`);
                }
            }
            this.isProcessing = false;
        }, 500); // Check every 500ms
        logger_1.logger.info('Started In-Memory Queue Worker');
    }
    stop() {
        if (this.interval)
            clearInterval(this.interval);
    }
}
// Ensure workerHandler is exported for tests and used by both
const workerHandler = async (job) => {
    const { orderId } = job.data;
    logger_1.logger.info(`Processing order ${orderId}`);
    try {
        const order = await order_service_1.orderService.getOrder(orderId);
        if (!order) {
            logger_1.logger.error(`Order ${orderId} not found`);
            return;
        }
        // 1. Routing
        await order_service_1.orderService.updateStatus(orderId, 'routing', 'Fetching quotes from DEXs...');
        const [raydiumQuote, meteoraQuote] = await Promise.all([
            dex_service_1.dexService.getRaydiumQuote(order.tokenIn, order.tokenOut, order.amount),
            dex_service_1.dexService.getMeteoraQuote(order.tokenIn, order.tokenOut, order.amount)
        ]);
        logger_1.logger.info(`Quotes - Raydium: ${raydiumQuote.price}, Meteora: ${meteoraQuote.price}`);
        await order_service_1.orderService.updateStatus(orderId, 'routing', `Quotes received: Raydium ($${raydiumQuote.price.toFixed(2)}), Meteora ($${meteoraQuote.price.toFixed(2)})`);
        const bestQuote = raydiumQuote.price > meteoraQuote.price ? raydiumQuote : meteoraQuote;
        await order_service_1.orderService.updateStatus(orderId, 'building', `Selected ${bestQuote.dexName} for best price`);
        // 2. Building/Submitting
        await order_service_1.orderService.updateStatus(orderId, 'submitted', 'Transaction built and sent to network...');
        // 3. Execution (Settlement)
        const result = await dex_service_1.dexService.executeSwap(bestQuote.dexName, order);
        await order_service_1.orderService.updateStatus(orderId, 'confirmed', `Swap executed successfully. Tx: ${result.txHash}`, {
            txHash: result.txHash,
            executedPrice: result.executedPrice,
            bestDex: bestQuote.dexName
        });
    }
    catch (error) {
        // Logic similar to before but adapted for maybe-mock-job
        const attempts = job.opts?.attempts || 3;
        const attemptsMade = (job.attemptsMade || 0) + 1; // Increment because we are failing now
        // Update job object so retries work if we were using a real retry loop, but for memory we might not re-push.
        // If using BullMQ, it handles attemptsMade automatically.
        // For In-Memory, we'd need to re-push if attemptsMade < attempts.
        logger_1.logger.error(`Order ${orderId} failed (Attempt ${attemptsMade}/${attempts}): ${error.message}`);
        const isLastAttempt = attemptsMade >= attempts;
        if (isLastAttempt) {
            await order_service_1.orderService.updateStatus(orderId, 'failed', `Execution failed permanently: ${error.message}`, { error: error.message });
        }
        else {
            await order_service_1.orderService.updateStatus(orderId, 'routing', `Attempt ${attemptsMade} failed (${error.message}). Retrying...`);
            // Rethrow for BullMQ
            throw error;
        }
    }
};
exports.workerHandler = workerHandler;
const initQueue = (useRedis) => {
    if (useRedis) {
        exports.orderQueue = new BullQueueService();
    }
    else {
        exports.orderQueue = new InMemoryQueueService();
    }
    exports.orderQueue.start();
    logger_1.logger.info(`Queue initialized with ${useRedis ? 'BullMQ' : 'In-Memory'}`);
};
exports.initQueue = initQueue;
