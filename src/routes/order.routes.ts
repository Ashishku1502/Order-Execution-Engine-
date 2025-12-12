import { FastifyInstance } from 'fastify';
import { executeOrder, orderWebSocket } from '../controllers/order.controller';

export default async function orderRoutes(fastify: FastifyInstance) {
    // POST /api/orders/execute
    fastify.post('/execute', executeOrder);

    // WS /api/orders/execute or /api/orders/ws?
    // Requirement: "Single endpoint handles both protocols"
    // We can map the same route for websocket.
    fastify.get('/execute', { websocket: true }, orderWebSocket);
}
