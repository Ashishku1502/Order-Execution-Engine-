"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const queue_service_1 = require("../services/queue.service");
const order_service_1 = require("../services/order.service");
const dex_service_1 = require("../services/dex.service");
jest.mock('../config/redis', () => ({
    redisConnection: {},
    redisPub: {},
    redisSub: {}
}));
jest.mock('bullmq', () => ({
    Queue: jest.fn(),
    Worker: jest.fn().mockImplementation(() => ({
        on: jest.fn()
    })),
}));
jest.mock('../services/order.service');
jest.mock('../services/dex.service');
describe('Worker Handler', () => {
    const mockOrder = {
        id: '123',
        type: 'MARKET',
        tokenIn: 'SOL',
        tokenOut: 'USDC',
        amount: 1,
        status: 'pending',
        logs: []
    };
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('successfully processes an order', async () => {
        order_service_1.orderService.getOrder.mockResolvedValue(mockOrder);
        dex_service_1.dexService.getRaydiumQuote.mockResolvedValue({ dexName: 'Raydium', price: 100, fee: 0.1 });
        dex_service_1.dexService.getMeteoraQuote.mockResolvedValue({ dexName: 'Meteora', price: 98, fee: 0.1 });
        dex_service_1.dexService.executeSwap.mockResolvedValue({ txHash: 'tx123', executedPrice: 100 });
        const mockJob = {
            data: { orderId: '123' },
            opts: { attempts: 3 },
            attemptsMade: 1
        };
        await (0, queue_service_1.workerHandler)(mockJob);
        expect(order_service_1.orderService.getOrder).toHaveBeenCalledWith('123');
        expect(order_service_1.orderService.updateStatus).toHaveBeenCalledTimes(5); // routing, routing(quotes), building, submitted, confirmed
        // Let's count calls in implementation:
        // 1. "routing" (Fetching quotes)
        // 2. "routing" (Quotes received)
        // 3. "building" (Selected)
        // 4. "submitted"
        // 5. "confirmed"
        // Total 5 calls really.
        expect(dex_service_1.dexService.executeSwap).toHaveBeenCalledWith('Raydium', mockOrder);
    });
    test('handles errors gracefully', async () => {
        order_service_1.orderService.getOrder.mockRejectedValue(new Error('DB Error'));
        const mockJob = {
            data: { orderId: '123' },
            opts: { attempts: 3 },
            attemptsMade: 1
        };
        await expect((0, queue_service_1.workerHandler)(mockJob)).rejects.toThrow('DB Error');
        // It might not catch the updateStatus call if creation fails? 
        // Logic: if catch, updateStatus('failed').
        // But getOrder threw.
    });
});
