export type OrderType = 'MARKET' | 'LIMIT' | 'SNIPER';
export type OrderStatus = 'pending' | 'routing' | 'building' | 'submitted' | 'confirmed' | 'failed';

export interface OrderRequest {
    type: OrderType;
    tokenIn: string;
    tokenOut: string;
    amount: number;
}

export interface Order {
    id: string;
    type: OrderType;
    tokenIn: string;
    tokenOut: string;
    amount: number;
    status: OrderStatus;
    txHash?: string;
    error?: string;
    createdAt: Date;
    updatedAt: Date;
    logs: string[];
    executedPrice?: number;
    bestDex?: string;
}

export interface DexQuote {
    dexName: 'Raydium' | 'Meteora';
    price: number;
    fee: number;
}
