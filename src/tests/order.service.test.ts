import { OrderService } from '../services/order.service';
import { OrderRequest } from '../types';

// Mock Storage
jest.mock('../services/storage.service', () => ({
    storage: {
        saveOrder: jest.fn(),
        getOrder: jest.fn(),
        updateOrder: jest.fn(),
    }
}));

// Mock Redis just in case (for pubsub)
jest.mock('../config/redis', () => ({
    redisPub: { publish: jest.fn() },
    isRedisConnected: true
}));

import { orderService } from '../services/order.service';
import { storage } from '../services/storage.service';
import { redisPub } from '../config/redis';

describe('OrderService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    test('createOrder saves to Storage', async () => {
        const req: OrderRequest = {
            type: 'MARKET',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1
        };

        const order = await orderService.createOrder(req);

        expect(order.id).toBeDefined();
        expect(order.status).toBe('pending');
        expect(storage.saveOrder).toHaveBeenCalledWith(expect.objectContaining({
            id: order.id,
            type: 'MARKET'
        }));
    });

    test('updateStatus updates Storage and Publishes to Redis', async () => {
        // Mock getOrder to return order
        (storage.getOrder as jest.Mock).mockResolvedValue({
            id: '123',
            status: 'pending',
            logs: [],
            type: 'MARKET',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1
        });

        await orderService.updateStatus('123', 'routing', 'Log message');

        expect(storage.updateOrder).toHaveBeenCalled();
        expect(redisPub!.publish).toHaveBeenCalled();
    });
});
