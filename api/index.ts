import express from 'express';
import cors from 'cors';
import { apiRouter } from '../src/apiHandlers';

const app = express();
app.use(cors({ origin: '*', credentials: false }));
app.use(express.json());
app.use(apiRouter);

// Global error handler for uncaught serverless errors
app.use((err: any, req: any, res: any, next: any) => {
  console.error('Serverless API uncaught error:', err);
  res.status(500).json({
    success: false,
    error: err?.message || 'Erro interno no servidor'
  });
});

export default app;
