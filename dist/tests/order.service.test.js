"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
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
const order_service_1 = require("../services/order.service");
const storage_service_1 = require("../services/storage.service");
const redis_1 = require("../config/redis");
describe('OrderService', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });
    test('createOrder saves to Storage', async () => {
        const req = {
            type: 'MARKET',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1
        };
        const order = await order_service_1.orderService.createOrder(req);
        expect(order.id).toBeDefined();
        expect(order.status).toBe('pending');
        expect(storage_service_1.storage.saveOrder).toHaveBeenCalledWith(expect.objectContaining({
            id: order.id,
            type: 'MARKET'
        }));
    });
    test('updateStatus updates Storage and Publishes to Redis', async () => {
        // Mock getOrder to return order
        storage_service_1.storage.getOrder.mockResolvedValue({
            id: '123',
            status: 'pending',
            logs: [],
            type: 'MARKET',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1
        });
        await order_service_1.orderService.updateStatus('123', 'routing', 'Log message');
        expect(storage_service_1.storage.updateOrder).toHaveBeenCalled();
        expect(redis_1.redisPub.publish).toHaveBeenCalled();
    });
});
