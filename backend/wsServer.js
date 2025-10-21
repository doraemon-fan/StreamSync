const WebSocket = require('ws');

// Create a WebSocket server on port 4000
const wss = new WebSocket.Server({port: 4000}, () => {
    console.log('WebSocket server running on ws://localhost:4000');
})

// Listen for new connection
wss.on('connection', (ws) => {
    console.log('New client connected');

    // Listen for incoming messages (chunk)
    ws.on('message', (data, isBinary) => {
        console.log('Received chunk of size: ',  data.length);

        // Broadcast to all other clients
        wss.clients.forEach((client) => {
            if(client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data, {binary: isBinary}); // send the chunk
            }
        })
    })

    // Handle client disconnect
    ws.on('close', () => {
        console.log('Client disconnected');
    })

    ws.on('error', (err) => {
        console.error('WebSocket error: ', err);
    })
})