import express from "express"
import http from "http"
import { Server } from "socket.io"
import cors from "cors"
import roomRoutes from "./routes/room"
import { registerSyncHandlers } from "./sockets/sync"

const app = express()
app.use(cors())
app.use(express.json())

app.use("/room", roomRoutes)

app.get("/api/ping", (req, res) => res.json({ message: "pong" }))

const server = http.createServer(app)
const io = new Server(server, { cors: { origin: "*" } })

io.on("connection", (socket) => {
  console.log(`[socket] Connected: ${socket.id}`)
  registerSyncHandlers(io, socket)

  socket.on("disconnect", () => console.log(`[socket] disconnected: ${socket.id}`))
})

const PORT = process.env.PORT || 5000
server.listen(PORT, () => console.log(`Server running on http://localhost:${PORT}`))
