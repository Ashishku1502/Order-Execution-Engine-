import { workerHandler } from '../services/queue.service';
import { orderService } from '../services/order.service';
import { dexService } from '../services/dex.service';
import { Job } from 'bullmq';

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
        (orderService.getOrder as jest.Mock).mockResolvedValue(mockOrder);
        (dexService.getRaydiumQuote as jest.Mock).mockResolvedValue({ dexName: 'Raydium', price: 100, fee: 0.1 });
        (dexService.getMeteoraQuote as jest.Mock).mockResolvedValue({ dexName: 'Meteora', price: 98, fee: 0.1 });
        (dexService.executeSwap as jest.Mock).mockResolvedValue({ txHash: 'tx123', executedPrice: 100 });

        const mockJob = {
            data: { orderId: '123' },
            opts: { attempts: 3 },
            attemptsMade: 1
        } as unknown as Job;

        await workerHandler(mockJob);

        expect(orderService.getOrder).toHaveBeenCalledWith('123');
        expect(orderService.updateStatus).toHaveBeenCalledTimes(5); // routing, routing(quotes), building, submitted, confirmed
        // Let's count calls in implementation:
        // 1. "routing" (Fetching quotes)
        // 2. "routing" (Quotes received)
        // 3. "building" (Selected)
        // 4. "submitted"
        // 5. "confirmed"
        // Total 5 calls really.

        expect(dexService.executeSwap).toHaveBeenCalledWith('Raydium', mockOrder);
    });

    test('handles errors gracefully', async () => {
        (orderService.getOrder as jest.Mock).mockRejectedValue(new Error('DB Error'));

        const mockJob = {
            data: { orderId: '123' },
            opts: { attempts: 3 },
            attemptsMade: 1
        } as unknown as Job;

        await expect(workerHandler(mockJob)).rejects.toThrow('DB Error');
        // It might not catch the updateStatus call if creation fails? 
        // Logic: if catch, updateStatus('failed').
        // But getOrder threw.
    });
});
