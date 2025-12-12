import { Pool } from 'pg';
import dotenv from 'dotenv';
import { logger } from '../utils/logger';

dotenv.config();

let pool: Pool | null = null;
let isConnected = false;

// Try to initialize
export const initDb = () => {
    try {
        if (pool) return;
        pool = new Pool({
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
            logger.warn('Postgres client error', err.message);
        });
    } catch (e) {
        logger.warn('Could not create Postgres pool config');
    }
};

export const checkDbConnection = async (): Promise<boolean> => {
    if (!pool) return false;
    try {
        const client = await pool.connect();
        client.release();
        isConnected = true;
        logger.info('Connected to PostgreSQL');
        return true;
    } catch (err: any) {
        logger.warn(`Failed to connect to PostgreSQL (${err.message}). Switching to In-Memory DB.`);
        isConnected = false;
        return false;
    }
};

export const query = async (text: string, params?: any[]) => {
    if (isConnected && pool) {
        return pool.query(text, params);
    }
    throw new Error('Database not connected');
};

export const isDbConnected = () => isConnected;
