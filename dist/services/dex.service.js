"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.dexService = exports.MockDexRouter = void 0;
const logger_1 = require("../utils/logger");
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
class MockDexRouter {
    constructor() {
        this.basePrice = 100; // Mock base price
    }
    async getRaydiumQuote(tokenIn, tokenOut, amount) {
        // Simulate network delay
        await sleep(200);
        // Return price with some variance (0.98 - 1.02)
        const price = this.basePrice * (0.98 + Math.random() * 0.04);
        return { dexName: 'Raydium', price, fee: 0.003 };
    }
    async getMeteoraQuote(tokenIn, tokenOut, amount) {
        await sleep(200);
        // Variance (0.97 - 1.02)
        const price = this.basePrice * (0.97 + Math.random() * 0.05);
        return { dexName: 'Meteora', price, fee: 0.002 };
    }
    async executeSwap(dex, order) {
        logger_1.logger.info(`Executing swap on ${dex} for order ${order.id}`);
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
exports.MockDexRouter = MockDexRouter;
exports.dexService = new MockDexRouter();
