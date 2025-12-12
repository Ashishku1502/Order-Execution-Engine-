import { executeOrder } from '../controllers/order.controller';
import { orderService } from '../services/order.service';
import { orderQueue } from '../services/queue.service';

jest.mock('../services/order.service');
jest.mock('../services/queue.service', () => ({
    orderQueue: { add: jest.fn() }
}));
jest.mock('../config/redis', () => ({ redisSub: {} }));

describe('OrderController', () => {
    let req: any;
    let reply: any;

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
        (orderService.createOrder as jest.Mock).mockResolvedValue({ id: '123' });

        await executeOrder(req, reply);

        expect(reply.status).toHaveBeenCalledWith(202);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ orderId: '123' }));
        expect(orderQueue.add).toHaveBeenCalled();
    });

    test('executeOrder missing validation', async () => {
        req.body = { type: 'MARKET' }; // Missing others

        await executeOrder(req, reply);

        expect(reply.status).toHaveBeenCalledWith(400);
        expect(reply.send).toHaveBeenCalledWith(expect.objectContaining({ error: 'Missing required fields' }));
    });

    test('executeOrder internal error', async () => {
        req.body = { type: 'MARKET', tokenIn: 'SOL', tokenOut: 'USDC', amount: 1 };
        (orderService.createOrder as jest.Mock).mockRejectedValue(new Error('Fail'));

        await executeOrder(req, reply);

        expect(reply.status).toHaveBeenCalledWith(500);
    });
});
