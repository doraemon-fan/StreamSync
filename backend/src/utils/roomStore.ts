import { Room, RoomState, Member } from '../types/room';
import { v4 as uuidv4 } from 'uuid';

class RoomStore {
    private rooms: Map<string, Room> = new Map();
    private socketToRoom: Map<string, { roomId: string; memberName: string }> = new Map();

    createRoom(adminName: string): Room {
        const roomId = uuidv4().slice(0, 8);
        const room: Room = {
            id: roomId,
            admin: adminName,
            members: [{
                name: adminName,
                socketId: null,
                role: 'admin',
            }],
            isReady: false,
            state: {
                isPlaying: false,
                timestamp: 0,
                updatedAt: null,
            },
            createdAt: Date.now(),
        };
        this.rooms.set(roomId, room);
        return room;
    }

    joinRoom(roomId: string, memberName: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;

        const existing = room.members.find(m => m.name === memberName);
        if (!existing) {
            room.members.push({
                name: memberName,
                socketId: null,
                role: 'member',
            });
        }
        return room;
    }

    bindSocket(roomId: string, memberName: string, socketId: string): void {
        const room = this.rooms.get(roomId);
        if (!room) return;

        const member = room.members.find(m => m.name === memberName);
        if (member) {
            member.socketId = socketId;
        }
        this.socketToRoom.set(socketId, { roomId, memberName });
    }

    removeMemberBySocket(socketId: string): { roomId: string; memberName: string; room: Room } | null {
        const mapping = this.socketToRoom.get(socketId);
        if (!mapping) return null;

        const { roomId, memberName } = mapping;
        const room = this.rooms.get(roomId);
        if (!room) {
            this.socketToRoom.delete(socketId);
            return null;
        }

        room.members = room.members.filter(m => m.socketId !== socketId);
        this.socketToRoom.delete(socketId);

        return { roomId, memberName, room };
    }

    getRoom(roomId: string): Room | null {
        return this.rooms.get(roomId) || null;
    }

    isAdmin(roomId: string, memberName: string): boolean {
        const room = this.rooms.get(roomId);
        if (!room) return false;
        return room.admin === memberName;
    }

    setReady(roomId: string): Room | null {
        const room = this.rooms.get(roomId);
        if (!room) return null;
        room.isReady = true;
        return room;
    }

    updateState(roomId: string, state: Partial<RoomState>): void {
        const room = this.rooms.get(roomId);
        if (room) {
            room.state = { ...room.state, ...state };
        }
    }

    deleteRoom(roomId: string): boolean {
        return this.rooms.delete(roomId);
    }

    getSocketRoom(socketId: string): { roomId: string; memberName: string } | null {
        return this.socketToRoom.get(socketId) || null;
    }
}

export const roomStore = new RoomStore();
