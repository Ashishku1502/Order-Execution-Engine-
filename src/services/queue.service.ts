import { Queue, Worker, Job } from 'bullmq';
import { redisConnection, isRedisConnected } from '../config/redis';
import { orderService } from './order.service';
import { dexService } from './dex.service';
import { logger } from '../utils/logger';

const QUEUE_NAME = 'order-execution';

// Abstraction for Queue
export interface IQueueService {
    add(name: string, data: any): Promise<void>;
    start(): void; // Start processing
    stop(): void; // Stop processing
}

// BullMQ Implementation
class BullQueueService implements IQueueService {
    private queue: Queue;
    private worker: Worker;

    constructor() {
        if (!redisConnection) throw new Error('Redis not connected');

        this.queue = new Queue(QUEUE_NAME, {
            connection: redisConnection,
            defaultJobOptions: {
                attempts: 3,
                backoff: { type: 'exponential', delay: 1000 },
                removeOnComplete: true,
                removeOnFail: false
            }
        });

        this.worker = new Worker(QUEUE_NAME, workerHandler, {
            connection: redisConnection,
            concurrency: 10,
            limiter: { max: 100, duration: 60000 }
        });

        this.worker.on('failed', (job, err) => {
            if (job) logger.error(`Job ${job.id} failed: ${err.message}`);
        });
    }

    async add(name: string, data: any): Promise<void> {
        await this.queue.add(name, data);
    }

    start() {
        // BullMQ worker starts automatically on instantiation but we can resume if paused
        if (this.worker.isPaused()) this.worker.resume();
    }

    stop() {
        this.worker.close();
        this.queue.close();
    }
}

// In-Memory Queue Implementation
class InMemoryQueueService implements IQueueService {
    private queue: { data: any; attemptsMade: number }[] = [];
    private interval: NodeJS.Timeout | null = null;
    private isProcessing = false;

    async add(name: string, data: any): Promise<void> {
        this.queue.push({ data, attemptsMade: 0 });
        logger.info(`Added to memory queue: ${data.orderId}`);
    }

    start() {
        if (this.interval) return;
        this.interval = setInterval(async () => {
            if (this.queue.length === 0 || this.isProcessing) return;

            this.isProcessing = true;
            const jobWrapper = this.queue.shift();

            if (jobWrapper) {
                // Mock job object with attempt tracking
                const mockJob = {
                    data: jobWrapper.data,
                    attemptsMade: jobWrapper.attemptsMade,
                    opts: { attempts: 3 }
                } as any;

                try {
                    await workerHandler(mockJob);
                } catch (e: any) {
                    mockJob.attemptsMade++;
                    if (mockJob.attemptsMade < mockJob.opts.attempts) {
                        logger.warn(`Memory job failed. Retrying... (${mockJob.attemptsMade}/${mockJob.opts.attempts})`);
                        // Push back to queue to retry
                        this.queue.push({ data: mockJob.data, attemptsMade: mockJob.attemptsMade });
                    } else {
                        logger.error(`Memory job failed permanently: ${e.message}`);
                    }
                }
            }
            this.isProcessing = false;
        }, 500); // Check every 500ms
        logger.info('Started In-Memory Queue Worker');
    }

    stop() {
        if (this.interval) clearInterval(this.interval);
    }
}

// Ensure workerHandler is exported for tests and used by both
export const workerHandler = async (job: Job<{ orderId: string }> | any) => {
    const { orderId } = job.data;
    logger.info(`Processing order ${orderId}`);

    try {
        const order = await orderService.getOrder(orderId);
        if (!order) {
            logger.error(`Order ${orderId} not found`);
            return;
        }

        // 1. Routing
        await orderService.updateStatus(orderId, 'routing', 'Fetching quotes from DEXs...');

        const [raydiumQuote, meteoraQuote] = await Promise.all([
            dexService.getRaydiumQuote(order.tokenIn, order.tokenOut, order.amount),
            dexService.getMeteoraQuote(order.tokenIn, order.tokenOut, order.amount)
        ]);

        logger.info(`Quotes - Raydium: ${raydiumQuote.price}, Meteora: ${meteoraQuote.price}`);
        await orderService.updateStatus(orderId, 'routing', `Quotes received: Raydium ($${raydiumQuote.price.toFixed(2)}), Meteora ($${meteoraQuote.price.toFixed(2)})`);

        const bestQuote = raydiumQuote.price > meteoraQuote.price ? raydiumQuote : meteoraQuote;

        await orderService.updateStatus(orderId, 'building', `Selected ${bestQuote.dexName} for best price`);

        // 2. Building/Submitting
        await orderService.updateStatus(orderId, 'submitted', 'Transaction built and sent to network...');

        // 3. Execution (Settlement)
        const result = await dexService.executeSwap(bestQuote.dexName, order);

        await orderService.updateStatus(orderId, 'confirmed', `Swap executed successfully. Tx: ${result.txHash}`, {
            txHash: result.txHash,
            executedPrice: result.executedPrice,
            bestDex: bestQuote.dexName
        });

    } catch (error: any) {
        // Logic similar to before but adapted for maybe-mock-job
        const attempts = job.opts?.attempts || 3;
        const attemptsMade = (job.attemptsMade || 0) + 1; // Increment because we are failing now

        // Update job object so retries work if we were using a real retry loop, but for memory we might not re-push.
        // If using BullMQ, it handles attemptsMade automatically.
        // For In-Memory, we'd need to re-push if attemptsMade < attempts.

        logger.error(`Order ${orderId} failed (Attempt ${attemptsMade}/${attempts}): ${error.message}`);

        const isLastAttempt = attemptsMade >= attempts;

        if (isLastAttempt) {
            await orderService.updateStatus(orderId, 'failed', `Execution failed permanently: ${error.message}`, { error: error.message });
        } else {
            await orderService.updateStatus(orderId, 'routing', `Attempt ${attemptsMade} failed (${error.message}). Retrying...`);
            // Rethrow for BullMQ
            throw error;
        }
    }
};

export let orderQueue: IQueueService;

export const initQueue = (useRedis: boolean) => {
    if (useRedis) {
        orderQueue = new BullQueueService();
    } else {
        orderQueue = new InMemoryQueueService();
    }
    orderQueue.start();
    logger.info(`Queue initialized with ${useRedis ? 'BullMQ' : 'In-Memory'}`);
};
