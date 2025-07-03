import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import http from "http"

// import do banco de dados
import { connectDatabase } from "./config/connectDatabase.js";

// import dos routes
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

// library para selecionar quais endereços no frontend podem enviar requests para o backend, se não usado, o backend só pode ser chamado pela propria origem
app.use(cors());

// usando library .json que permite enviar respostas .json
app.use(express.json());

// criando os endereços e usando os routes
app.use("/api/users", userRoutes);
app.use("/api/lines", lineRoutes);
app.use("/api/trips", tripRoutes);
app.use('/api/maintenance', maintenanceRoutes);

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

// são os listeners que definem o que acontece quando um cliente se conecta ao socket, o client pode se conectar usando socket.emit("joinTrip", "trip123");
io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    // quando o client se conecta, o servidor recebe esse evento
    socket.on('joinTrip', (tripId) => {
        // ele entra numa sala existente, onde o cliente pode atualizar dados via commands post, e todos conectados à sala vão receber atualizações diretamente no frontend
        // essas atualizações são dados, no nosso caso, é a posição do cliente (onibus), que vai ser atualizada na tela dos usuários
        socket.join(tripId);
        console.log(`Socket ${socket.id} entrou na sala da trip ${tripId}`);
    });

    // disconecta o cliente da sala
    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
    });
});


const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
