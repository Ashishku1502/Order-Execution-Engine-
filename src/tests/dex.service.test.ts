import { MockDexRouter } from '../services/dex.service';
import { Order } from '../types';

describe('DexService', () => {
    let dexService: MockDexRouter;

    beforeEach(() => {
        dexService = new MockDexRouter();
    });

    test('getRaydiumQuote returns valid quote structure', async () => {
        const quote = await dexService.getRaydiumQuote('SOL', 'USDC', 1);
        expect(quote.dexName).toBe('Raydium');
        expect(quote.price).toBeGreaterThan(0);
        expect(quote.fee).toBe(0.003);
    });

    test('getMeteoraQuote returns valid quote structure', async () => {
        const quote = await dexService.getMeteoraQuote('SOL', 'USDC', 1);
        expect(quote.dexName).toBe('Meteora');
        expect(quote.price).toBeGreaterThan(0);
        expect(quote.fee).toBe(0.002);
    });

    test('executeSwap returns txHash', async () => {
        const order: Order = {
            id: 'test-id',
            type: 'MARKET',
            tokenIn: 'SOL',
            tokenOut: 'USDC',
            amount: 1,
            status: 'routing',
            createdAt: new Date(),
            updatedAt: new Date(),
            logs: []
        };
        const result = await dexService.executeSwap('Raydium', order);
        expect(result.txHash).toBeDefined();
        expect(result.executedPrice).toBeGreaterThan(0);
    });
});
