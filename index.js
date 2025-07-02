import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDatabase } from "./config/connectDatabase.js";
import userRoutes from "./routes/userRoutes.js";
import lineRoutes from "./routes/lineRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import maintenanceRoutes from './routes/maintenanceRoutes.js';
import http from "http"
import { errorHandler } from "./middleware/errorHandler.js";

import { Server } from "socket.io";



dotenv.config();
connectDatabase();

const app = express();
app.use(cors());
app.use(express.json());

app.use("/api/users", userRoutes);
app.use("/api/lines", lineRoutes);
app.use("/api/trips", tripRoutes);
app.use('/api/maintenance', maintenanceRoutes);

app.use(errorHandler);

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: '*', // ou frontend específico no futuro
  },
});

// Registrar io para uso nos controllers
app.set('io', io);

// WebSocket listeners
io.on('connection', (socket) => {
  console.log('Cliente conectado:', socket.id);

  socket.on('joinTrip', (tripId) => {
    socket.join(tripId);
    console.log(`Socket ${socket.id} entrou na sala da trip ${tripId}`);
  });

  socket.on('disconnect', () => {
    console.log('Cliente desconectado:', socket.id);
  });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
