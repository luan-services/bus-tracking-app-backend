import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http"
import { rateLimitHandler } from "./middleware/rateLimitHandler.js";
// import do banco de dados
import { connectDatabase } from "./config/connectDatabase.js";

import cookieParser from "cookie-parser";

// import dos routes
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import lineRoutes from "./routes/lineRoutes.js";
import tripRoutes from "./routes/tripRoutes.js";
import maintenanceRoutes from './routes/maintenanceRoutes.js';

// import do middleware errorHandler
import { errorHandler } from "./middleware/errorHandler.js";

// import da função server do socket.io para enviar dados realtime e atualizar a página
import { Server } from "socket.io";


// baixando as variáveis .env
dotenv.config();
// conectando a database
connectDatabase();

// iniciando express
const app = express();

const corsOptions = {
  origin: process.env.NODE_ENV === "production" ? (process.env.FRONTEND_ALLOWED_URL ? process.env.FRONTEND_ALLOWED_URL : '*') : ['http://localhost:3000','http://localhost:8000', '*'], // Diz ao navegador qual origem específica é permitida.
  credentials: true,               // Diz ao navegador que é permitido receber cookies desta origem.
};
// library para selecionar quais endereços no frontend podem enviar requests para o backend, se não usado, o backend só pode ser chamado pela propria origem
app.use(cors(corsOptions));

// usando library .json que permite enviar respostas .json
app.use(express.json());

// incluindo cookieparser para criação de cookies
app.use(cookieParser());

// criando os endereços e usando os routes
app.use("/api/auth", rateLimitHandler(15 * 60 * 1000, 100), authRoutes)
app.use("/api/users", rateLimitHandler(15 * 60 * 1000, 100), userRoutes);
app.use("/api/lines", rateLimitHandler(15 * 60 * 1000, 100), lineRoutes);
app.use("/api/trips", rateLimitHandler(15 * 60 * 1000, 100), tripRoutes);
app.use('/api/maintenance', rateLimitHandler(15 * 60 * 1000, 100), maintenanceRoutes);

// usando errorHandler para tratar erros lançados no app
app.use(errorHandler);

// cria um server no app
const server = http.createServer(app); 

// cria um server em cima do server criado
const io = new Server(server, {
    cors: {
        origin:  process.env.NODE_ENV === 'production' ? 'meusite' : '*', // define que qualquer url pode acessar nossa api, * libera pra qualquer site, quando for passar pra produção, é preciso mudar
    },
});

// registra server io para uso nos controllers
app.set('io', io);

// são os listeners que definem o que acontece quando um cliente se conecta ao socket
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // fica ouvindo uma 'mensagem' 'joinTrip' pro cliente especifico que acabou de entrar
    socket.on('joinTrip', (tripId) => {
        // pega o socket do cliente e coloca ele na sala especificada
        socket.join(tripId);
        console.log(`Socket ${socket.id} entrou na sala da trip ${tripId}`);
    });

    // fica ouvindo uma 'mensagem' disconect do client especifico
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
