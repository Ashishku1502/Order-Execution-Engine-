"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.isDbConnected = exports.query = exports.checkDbConnection = exports.initDb = void 0;
const pg_1 = require("pg");
const dotenv_1 = __importDefault(require("dotenv"));
const logger_1 = require("../utils/logger");
dotenv_1.default.config();
let pool = null;
let isConnected = false;
// Try to initialize
const initDb = () => {
    try {
        if (pool)
            return;
        pool = new pg_1.Pool({
            user: process.env.PG_USER || 'postgres',
            host: process.env.PG_HOST || 'localhost',
            database: process.env.PG_DATABASE || 'dex_router',
            password: process.env.PG_PASSWORD || 'password',
            port: parseInt(process.env.PG_PORT || '5432'),
            connectionTimeoutMillis: 2000, // Fail fast
        });
        pool.on('error', (err) => {
            // Suppress initial connection errors if we handle them elsewhere,
            // but for now log as warn
            logger_1.logger.warn('Postgres client error', err.message);
        });
    }
    catch (e) {
        logger_1.logger.warn('Could not create Postgres pool config');
    }
};
exports.initDb = initDb;
const checkDbConnection = async () => {
    if (!pool)
        return false;
    try {
        const client = await pool.connect();
        client.release();
        isConnected = true;
        logger_1.logger.info('Connected to PostgreSQL');
        return true;
    }
    catch (err) {
        logger_1.logger.warn(`Failed to connect to PostgreSQL (${err.message}). Switching to In-Memory DB.`);
        isConnected = false;
        return false;
    }
};
exports.checkDbConnection = checkDbConnection;
const query = async (text, params) => {
    if (isConnected && pool) {
        return pool.query(text, params);
    }
    throw new Error('Database not connected');
};
exports.query = query;
const isDbConnected = () => isConnected;
exports.isDbConnected = isDbConnected;
