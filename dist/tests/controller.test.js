"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const order_controller_1 = require("../controllers/order.controller");
const order_service_1 = require("../services/order.service");
const queue_service_1 = require("../services/queue.service");
jest.mock('../services/order.service');
jest.mock('../services/queue.service', () => ({
    orderQueue: { add: jest.fn() }
}));
jest.mock('../config/redis', () => ({ redisSub: {} }));
describe('OrderController', () => {
    let req;
    let reply;
    beforeEach(() => {
        req = { body: {} };
        reply = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };
        jest.clearAllMocks();
    });
    test('executeOrder success', async () => {
        req.body = { type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1 };
        order_service_1.orderService.createOrder.mockResolvedValue({ id: '123' });
        await (0, order_controller_1.executeOrder)(req, reply);
        expect(reply.status).toHaveBeenCalledWith(202);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ orderId: '123' }));
        expect(queue_service_1.orderQueue.add).toHaveBeenCalled();
    });
    test('executeOrder missing validation', async () => {
        req.body = { type: 'MARKET' }; // Missing others
        await (0, order_controller_1.executeOrder)(req, reply);
        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing required fields' }));
    });
    test('executeOrder internal error', async () => {
        req.body = { type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1 };
        order_service_1.orderService.createOrder.mockRejectedValue(new Error('Fail'));
        await (0, order_controller_1.executeOrder)(req, reply);
        expect(reply.status).toHaveBeenCalledWith(500);
    });
});
