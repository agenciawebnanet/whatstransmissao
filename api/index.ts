import express from 'express';
import cors from 'cors';
import { apiRouter } from '../src/apiHandlers.js';

const app = express();
app.use(cors({ origin: '*', credentials: false }));
// Safe JSON parser: prevents SyntaxError 500 on client retries or malformed bodies
app.use(express.json({ strict: false }));
app.use((err: any, req: any, res: any, next: any) => {
  if (err instanceof SyntaxError && 'body' in err) {
    req.body = {};
    return next();
  }
  next(err);
});

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
