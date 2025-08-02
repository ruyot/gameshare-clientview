const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const app = express();
const server = http.createServer(app);

// Enable CORS for all routes
app.use(cors());

// Rate limiting for HTTP endpoints
app.use('/api/', rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100             // max 100 HTTP calls per IP per minute
}));

// Serve static files from the current directory
// Note: In Vercel deployment, static files are served by Vercel's static hosting
app.use(express.static(__dirname));

// WebSocket server for signaling
const wss = new WebSocket.Server({ server });

// Store active sessions
const sessions = new Map();

// WebSocket connection handler
wss.on('connection', (ws, req) => {
    console.log('New WebSocket connection:', req.url);
    
    let sessionId = null;
    let clientType = null;
    
    // Per-socket message rate limiting
    let msgCount = 0;
    const MSG_LIMIT = 500;     // 500 messages per minute per client
    const WINDOW_MS = 60*1000; // reset every minute
    
    const resetCounter = () => msgCount = 0;
    const interval = setInterval(resetCounter, WINDOW_MS);
    
    ws.on('message', (data) => {
        // Check rate limit
        if (++msgCount > MSG_LIMIT) {
            ws.close(1008, "rate limit exceeded");
            return;
        }
        
        try {
            const message = JSON.parse(data.toString());
            console.log('Received message:', message);
            
            // Extract session info for all message types
            sessionId = message.session_id;
            clientType = message.client_type;

            switch (message.type) {
                case 'join':
                    // Initialize session if it doesn't exist
                    if (!sessions.has(sessionId)) {
                        sessions.set(sessionId, {
                            host: null,
                            clients: new Set(),
                            created_at: Date.now()
                        });
                    }
                    
                    const session = sessions.get(sessionId);
                    
                    if (clientType === 'host') {
                        session.host = ws;
                        console.log(`Host joined session: ${sessionId}`);
                    } else {
                        session.clients.add(ws);
                        console.log(`Client joined session: ${sessionId}`);
                    }
                    
                    // Send confirmation
                    ws.send(JSON.stringify({
                        type: 'joined',
                        session_id: sessionId,
                        client_type: clientType
                    }));

                    // CRITICAL: Forward join message to other participants!
                    console.log(`Forwarding join message from ${clientType} to other participants`);
                    if (clientType === 'host') {
                        // Host joined - forward to all clients
                        session.clients.forEach(client => {
                            if (client.readyState === WebSocket.OPEN) {
                                console.log(`Forwarding host join to client`);
                                client.send(JSON.stringify(message));
                            }
                        });
                    } else {
                        // Client joined - forward to host
                        if (session.host && session.host.readyState === WebSocket.OPEN) {
                            console.log(`Forwarding client join to host`);
                            session.host.send(JSON.stringify(message));
                        }
                    }
                    break;
                    
                case 'offer':
                case 'answer':
                case 'ice-candidate':
                    console.log(`Forwarding ${message.type} from ${clientType} in session ${sessionId}`);
                    // Forward message to other participants in the session
                    if (sessionId && sessions.has(sessionId)) {
                        const session = sessions.get(sessionId);
                        
                        if (clientType === 'host') {
                            // Host sending to clients
                            session.clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    console.log(`Forwarding ${message.type} to client`);
                                    client.send(JSON.stringify(message));
                                }
                            });
                        } else {
                            // Client sending to host
                            if (session.host && session.host.readyState === WebSocket.OPEN) {
                                console.log(`Forwarding ${message.type} to host`);
                                session.host.send(JSON.stringify(message));
                            }
                        }
                    }
                    break;
                    
                default:
                    console.log(`Forwarding unknown message type "${message.type}" from ${clientType} in session ${sessionId}`);
                    // Forward ANY unknown message type to other participants
                    if (sessionId && sessions.has(sessionId)) {
                        const session = sessions.get(sessionId);
                        
                        if (clientType === 'host') {
                            // Host sending to clients
                            session.clients.forEach(client => {
                                if (client.readyState === WebSocket.OPEN) {
                                    console.log(`Forwarding ${message.type} to client`);
                                    client.send(JSON.stringify(message));
                                }
                            });
                        } else {
                            // Client sending to host
                            if (session.host && session.host.readyState === WebSocket.OPEN) {
                                console.log(`Forwarding ${message.type} to host`);
                                session.host.send(JSON.stringify(message));
                            }
                        }
                    }
            }
        } catch (error) {
            console.error('Error processing message:', error);
            ws.send(JSON.stringify({
                type: 'error',
                message: 'Invalid message format'
            }));
        }
    });
    
    ws.on('close', () => {
        console.log('WebSocket connection closed');
        clearInterval(interval); // Clean up rate limit timer
        
        if (sessionId && sessions.has(sessionId)) {
            const session = sessions.get(sessionId);
            
            if (clientType === 'host') {
                session.host = null;
                console.log(`Host left session: ${sessionId}`);
            } else {
                session.clients.delete(ws);
                console.log(`Client left session: ${sessionId}`);
            }
            
            // Clean up empty sessions
            if (!session.host && session.clients.size === 0) {
                sessions.delete(sessionId);
                console.log(`Session cleaned up: ${sessionId}`);
            }
        }
    });
    
    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'OK',
        sessions: sessions.size,
        timestamp: new Date().toISOString()
    });
});

// Session info endpoint
app.get('/sessions', (req, res) => {
    const sessionInfo = Array.from(sessions.entries()).map(([id, session]) => ({
        id,
        has_host: !!session.host,
        client_count: session.clients.size,
        created_at: session.created_at
    }));
    
    res.json({
        sessions: sessionInfo,
        total_sessions: sessions.size
    });
});

// Serve the main page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

const PORT = process.env.PORT || 8080;
const HOST = process.env.HOST || '0.0.0.0';

server.listen(PORT, HOST, () => {
    console.log(`GameShare Remote Signaling Server running on ${HOST}:${PORT}`);
    console.log(`- Health check: http://${HOST}:${PORT}/health`);
    console.log(`- Sessions info: http://${HOST}:${PORT}/sessions`);
    console.log(`- WebSocket: ws://${HOST}:${PORT}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}); 