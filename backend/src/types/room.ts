export type Member = {
  id: string
  name: String
  isAdmin: boolean
  canControlPlayback: boolean
  canUpload: boolean
}

export type Room = {
  roomId: string
  createdAt: Date
  members: Member[]
  isReady: boolean
}
