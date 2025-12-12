[Uploading README.md…]()
# Backend Task 2: Order Execution Engine

This project implements a mock Order Execution Engine for Solana, supporting Market Orders with DEX routing, Queue management, and WebSocket status updates.

## Tech Stack
- Node.js + TypeScript
- Fastify (HTTP + WebSocket)
- BullMQ + Redis (Order Queue)
- PostgreSQL (Order History)

## Setup
1. **Prerequisites**: Redis and PostgreSQL must be running locally.
2. **Install Dependencies**:
   ```bash
   npm install
   ```
3. **Environment Variables**:
   Copy `.env.example` to `.env` and adjust if necessary:
   ```bash
   cp .env.example .env
   ```
4. **Run**:
   ```bash
   # Development
   npm run dev

   # Production
   npm run build
   npm start
   ```

## How It Works
1. **Order Submission**: POST `/api/orders/execute` creates an order and adds it to the specific queue.
2. **WebSocket**: Connect to `ws://localhost:3000/api/orders/execute?orderId=...` to receive real-time updates.
3. **Routing**: The worker fetches quotes from Mock Raydium and Mock Meteora, selecting the best price.
4. **Execution**: Simulates a swap transaction with delays and updates valid statuses.

## Design Decisions
### Order Type: Market Order
I chose **Market Order** because it is the fundamental building block of trading. It requires immediate execution at the best available price, which highlights the need for efficient routing and low-latency processing, perfect for demonstrating the core routing engine.

### Extensibility
To support **Limit Orders**, we would add a price check in the worker (or a separate "watch" queue) that only executes the swap when the mocked price meets the target.
For **Sniper Orders**, we would listen for new pool creation events (mocked or real) and trigger the execution flow immediately upon detection.

## API Endpoints
- **POST** `/api/orders/execute`
  Body: `{ "type": "MARKET", "tokenIn": "SOL", "tokenOut": "USDC", "amount": 1.0 }`
  Response: `{ "orderId": "..." }`

- **WS** `/api/orders/execute?orderId=...`
  Stream: `{ "type": "update", "data": { "status": "...", ... } }`

## Testing
Running `npm test` requires configuring Jest (not included in this skeleton, but logic is modular for testing).
Manual testing via Postman or `wscat` recommended.
