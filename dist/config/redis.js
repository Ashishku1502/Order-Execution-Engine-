"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isRedisConnected = exports.redisSub = exports.redisPub = exports.redisConnection = exports.checkRedisConnection = exports.initRedisClients = void 0;
const ioredis_1 = __importDefault(require("ioredis"));
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../utils/logger");
dotenv_1.default.config();
const redisConfig = {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: parseInt(process.env.REDIS_PORT || '6379'),
    maxRetriesPerRequest: null,
    retryStrategy: (times) => {
        if (times > 3) {
            return null; // Stop retrying after 3 attempts
        }
        return Math.min(times * 50, 2000);
    }
};
let redisConnection = null;
exports.redisConnection = redisConnection;
let redisPub = null;
exports.redisPub = redisPub;
let redisSub = null;
exports.redisSub = redisSub;
let isRedisConnected = false;
exports.isRedisConnected = isRedisConnected;
const initRedisClients = () => {
    try {
        if (redisConnection)
            return; // Already initialized
        exports.redisConnection = redisConnection = new ioredis_1.default(redisConfig);
        exports.redisPub = redisPub = new ioredis_1.default(redisConfig);
        exports.redisSub = redisSub = new ioredis_1.default(redisConfig);
        redisSub.setMaxListeners(0);
        // Handle error events so they don't crash the app
        const handleError = (err) => {
            // logger.warn(`Redis error: ${err.message}`); 
            // We will check connection status explicitly
        };
        redisConnection.on('error', handleError);
        redisPub.on('error', handleError);
        redisSub.on('error', handleError);
    }
    catch (e) {
        logger_1.logger.warn('Failed to initialize Redis clients');
    }
};
exports.initRedisClients = initRedisClients;
const checkRedisConnection = async () => {
    if (!redisConnection)
        return false;
    try {
        await redisConnection.ping();
        exports.isRedisConnected = isRedisConnected = true;
        logger_1.logger.info('Connected to Redis');
        return true;
    }
    catch (e) {
        logger_1.logger.warn(`Failed to connect to Redis (${e.message}). Switching to In-Memory mode.`);
        exports.isRedisConnected = isRedisConnected = false;
        // Clean up to prevent further connection attempts
        redisConnection?.disconnect();
        redisPub?.disconnect();
        redisSub?.disconnect();
        return false;
    }
};
exports.checkRedisConnection = checkRedisConnection;
