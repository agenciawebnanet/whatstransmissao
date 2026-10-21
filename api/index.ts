import express from 'express';
import cors from 'cors';
import { apiRouter } from '../src/apiHandlers.js';

const app = express();

app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(apiRouter);

export default app;
