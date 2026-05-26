import { Room } from "../types/room";

const rooms: Record<string, Room> = {};

export const roomStore = {
  create(roomId: string, adminName: string): Room {
    const room: Room = {
      roomId,
      createdAt: new Date(),
      members: [{ id: crypto.randomUUID(), name: adminName, isAdmin: true }],
      isReady: false,
    };
    rooms[roomId] = room;
    return room;
  },

  get(roomId: string): Room | undefined {
    return rooms[roomId];
  },

  join(roomId: string, memberName: string) {
    const room = rooms[roomId];
    if (!room) return null;

    const member = {
      id: crypto.randomUUID(),
      name: memberName,
      isAdmin: false,
    };
    room.members.push(member);
    return room;
  },

  setReady(roomId:string){
    if(rooms[roomId]) rooms[roomId].isReady = true
  },

  list(){
    return Object.values(rooms)
  }
}
