import IORedis from 'ioredis';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    retryStrategy: (times: number) => {
        if (times > 3) {
            return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 50, 2000);
    }
};

let redisConnection: IORedis | null = null;
let redisPub: IORedis | null = null;
let redisSub: IORedis | null = null;
let isRedisConnected = false;


export const initRedisClients = () => {
    try {
        if (redisConnection) return; // Already initialized

        redisConnection = new IORedis(redisConfig);
        redisPub = new IORedis(redisConfig);
        redisSub = new IORedis(redisConfig);
        redisSub.setMaxListeners(0);

        // Handle error events so they don't crash the app
        const handleError = (err: any) => {
            // logger.warn(`Redis error: ${err.message}`); 
            // We will check connection status explicitly
        };

        redisConnection.on('error', handleError);
        redisPub.on('error', handleError);
        redisSub.on('error', handleError);

    } catch (e) {
        logger.warn('Failed to initialize Redis clients');
    }
};

export const checkRedisConnection = async (): Promise<boolean> => {
    if (!redisConnection) return false;
    try {
        await redisConnection.ping();
        isRedisConnected = true;
        logger.info('Connected to Redis');
        return true;
    } catch (e: any) {
        logger.warn(`Failed to connect to Redis (${e.message}). Switching to In-Memory mode.`);
        isRedisConnected = false;
        // Clean up to prevent further connection attempts
        redisConnection?.disconnect();
        redisPub?.disconnect();
        redisSub?.disconnect();
        return false;
    }
};

export { redisConnection, redisPub, redisSub, isRedisConnected };
