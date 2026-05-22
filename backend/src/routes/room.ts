import { Router } from "express";
import { v4 as uuidv4 } from "uuid"
import { roomStore } from "../utils/roomStore";

const router = Router()

router.post("/create", (req, res) => {
  const { adminName } = req.body
  if(!adminName) return res.status(400).json({error: "adminName required"})

  const roomId = uuidv4().slice(0,8)
  const room = roomStore.create(roomId, adminName)

  console.log(`[Room] Created: ${roomId} by ${adminName}`)
  res.json({roomId, room})
})

router.post("/join", (req, res) => {
  const { roomId, memberName } = req.body
  if(!roomId || !memberName) return res.status(400).json({error:"roomId and memberName required"})
  const room = roomStore.join(roomId, memberName)
  if(!room) return res.status(404).json({error: "room not found"})

  console.log(`[Room] ${memberName} joined: ${roomId}`)
  res.json({ room })
})

router.get("/:roomId", (req,res) => {
  const room = roomStore.get(req.params.roomId)
  if (!room) return res.status(404).json({ error: "room not found" })
  res.json({ room })
})

export default router
