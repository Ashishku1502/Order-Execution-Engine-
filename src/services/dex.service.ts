import { DexQuote, Order } from '../types';
import { logger } from '../utils/logger';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export class MockDexRouter {
    private basePrice = 100; // Mock base price

    async getRaydiumQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
        // Simulate network delay
        await sleep(200);
        // Return price with some variance (0.98 - 1.02)
        const price = this.basePrice * (0.98 + Math.random() * 0.04);
        return { dexName: 'Raydium', price, fee: 0.003 };
    }

    async getMeteoraQuote(tokenIn: string, tokenOut: string, amount: number): Promise<DexQuote> {
        await sleep(200);
        // Variance (0.97 - 1.02)
        const price = this.basePrice * (0.97 + Math.random() * 0.05);
        return { dexName: 'Meteora', price, fee: 0.002 };
    }

    async executeSwap(dex: string, order: Order): Promise<{ txHash: string; executedPrice: number }> {
        logger.info(`Executing swap on ${dex} for order ${order.id}`);
        // Simulate 2-3 second execution
        await sleep(2000 + Math.random() * 1000);

        // Fail randomly (optional, but good for testing robustness? Maybe keep it successful for now unless asked)
        // Let's implement a small fail chance if needed, but requirements say "If any step fails...".
        // I'll keep it simple for success path mostly.

        const executedPrice = this.basePrice; // Simplified
        const txHash = 'tx_' + Math.random().toString(36).substring(7);
        return { txHash, executedPrice };
    }
}

export const dexService = new MockDexRouter();
