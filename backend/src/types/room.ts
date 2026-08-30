export interface RoomState {
    isPlaying: boolean;
    timestamp: number;
    updatedAt: number | null;
}

export type MemberRole = 'admin' | 'member';

export interface Member {
    name: string;
    socketId: string | null;
    role: MemberRole;
}

export interface Room {
    id: string;
    admin: string;
    members: Member[];
    isReady: boolean;
    state: RoomState;
    createdAt: number;
}
