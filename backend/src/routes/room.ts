import { Router, Request, Response } from 'express';
import { Server } from 'socket.io';
import { roomStore } from '../utils/roomStore';

export function createRoomRouter(io: Server): Router {
    const router = Router();

    router.post('/create', (req: Request, res: Response): void => {
        const { adminName } = req.body;
        if (!adminName) {
            res.status(400).json({ error: 'adminName is required' });
            return;
        }
        const room = roomStore.createRoom(adminName);
        res.json({ roomId: room.id, room });
    });

    router.post('/join', (req: Request, res: Response): void => {
        const { roomId, memberName } = req.body;
        if (!roomId || !memberName) {
            res.status(400).json({ error: 'roomId and memberName are required' });
            return;
        }
        const room = roomStore.joinRoom(roomId, memberName);
        if (!room) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        res.json({ room });
    });

    router.get('/:roomId', (req: Request, res: Response): void => {
        const room = roomStore.getRoom(req.params.roomId);
        if (!room) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        res.json({ room });
    });

    // Called by FFmpeg service when transcoding produces the first segment
    router.post('/ready', (req: Request, res: Response): void => {
        const { roomId } = req.body;
        const room = roomStore.setReady(roomId);
        if (!room) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        io.to(roomId).emit('stream-ready', { roomId });
        console.log(`Stream ready for room ${roomId}, notified ${room.members.length} members`);
        res.json({ ok: true });
    });

    // Relay transcode progress to room members
    router.post('/transcode-progress', (req: Request, res: Response): void => {
        const { roomId, totalSecs, fps, speed } = req.body;
        io.to(roomId).emit('transcode-progress', { totalSecs, fps, speed });
        res.json({ ok: true });
    });

    router.delete('/:roomId', (req: Request, res: Response): void => {
        const { roomId } = req.params;
        const room = roomStore.getRoom(roomId);
        if (!room) {
            res.status(404).json({ error: 'Room not found' });
            return;
        }
        roomStore.deleteRoom(roomId);
        io.to(roomId).emit('room-deleted', { roomId });
        res.json({ ok: true });
    });

    return router;
}
