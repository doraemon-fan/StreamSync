import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors';
import { createRoomRouter } from './routes/room';
import { registerSyncHandlers } from './sockets/sync';

const app = express();
app.use(cors());
app.use(express.json());

const httpServer = createServer(app);
const io = new Server(httpServer, {
    cors: {
        origin: '*',
    },
});

app.use('/room', createRoomRouter(io));

io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id}`);
    registerSyncHandlers(io, socket);
});

const PORT = 5000;
httpServer.listen(PORT, () => {
    console.log(`Backend listening on port ${PORT}`);
});

export { io };
