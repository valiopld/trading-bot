import * as express from "express";
import * as cors from 'cors';
import * as https from 'https';

import * as Rotues from './routes';
import { envConfig, certObj } from './config';
import { Server } from 'socket.io';
import { handleSocketConnection } from './sockets';

const app = express();
app.use(cors());
Rotues.configureRoutes(app);

const SERVER_PORT = envConfig.PORT;
const listernCB = () => console.log(`Server Started on port ${SERVER_PORT}`);

export const socket = new Server(3001, {
   cors: {
        origin: "*",
        methods: ['GET', "POST"],
    }
});

socket.on('connection', handleSocketConnection)

const httpsServer = https.createServer(certObj, app);
httpsServer.listen(SERVER_PORT, listernCB);