export type Member = {
  id: string
  name: String
  isAdmin: boolean
}

export type Room = {
  roomId: string
  createdAt: Date
  members: Member[]
  isReady: boolean
}
