"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = orderRoutes;
const order_controller_1 = require("../controllers/order.controller");
async function orderRoutes(fastify) {
    // POST /api/orders/execute
    fastify.post('/execute', order_controller_1.executeOrder);
    // WS /api/orders/execute or /api/orders/ws?
    // Requirement: "Single endpoint handles both protocols"
    // We can map the same route for websocket.
    fastify.get('/execute', { websocket: true }, order_controller_1.orderWebSocket);
}
