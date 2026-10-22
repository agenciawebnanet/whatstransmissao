```ts
import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';

/* ==========================================================================
   Environment & Security Assertions (Fail-Fast on Missing Secrets)
   ========================================================================== */
if (!process.env.HMAC_SECRET) {
  throw new Error('HMAC_SECRET não configurado');
}

if (!process.env.FIREBASE_SERVICE_ACCOUNT) {
  throw new Error('FIREBASE_SERVICE_ACCOUNT não configurado');
}

const HMAC_SECRET: string = process.env.HMAC_SECRET;

const FIREBASE_CONFIG = {
  projectId: 'gen-lang-client-0919034007',
  firestoreDatabaseId: 'ai-studio-56f22fec-68b1-4f1c-9084-ced03b254908'
};

const targetFirestoreDbId = process.env.FIRESTORE_DATABASE_ID || process.env.VITE_FIREBASE_FIRESTORE_DATABASE_ID || FIREBASE_CONFIG.firestoreDatabaseId;

let firebaseAdminApp: any = null;

// Inicializa o Firebase para cada instância da Vercel
if (!getApps().length) {
  try {
    const serviceAccountRaw = process.env.FIREBASE_SERVICE_ACCOUNT || '{}';
    let serviceAccount: any = null;
    const trimmed = serviceAccountRaw.trim();
    if (trimmed.startsWith('{')) {
      serviceAccount = JSON.parse(trimmed);
    } else {
      const decoded = Buffer.from(trimmed, 'base64').toString('utf8');
      serviceAccount = JSON.parse(decoded);
    }
    firebaseAdminApp = initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || process.env.FIREBASE_PROJECT_ID || FIREBASE_CONFIG.projectId
    });
    console.log(`Firebase Admin inicializado com sucesso (banco: ${targetFirestoreDbId}).`);
  } catch (error) {
    console.error('Erro ao inicializar Firebase Admin:', error);
  }
} else {
  firebaseAdminApp = getApps()[0];
}

function getDb(): Firestore {
  const currentApp = getApps()[0] || firebaseAdminApp;
  if (!currentApp) {
    throw new Error('Firebase Admin App not initialized');
  }
  return getFirestore(currentApp, targetFirestoreDbId);
}

/* ==========================================================================
   Admin Authentication Middleware (Authorization: Bearer <firebase_id_token>)
   Verifica token com Firebase Auth e checa se UID está na coleção 'admins'
   ========================================================================== */
export async function requireAdminAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      state: 'UNAUTHORIZED',
      error: 'Token de autenticação ausente. Header Authorization: Bearer <firebase_id_token> é obrigatório.'
    });
  }

  const idToken = authHeader.substring(7).trim();
  if (!idToken) {
    return res.status(401).json({
      success: false,
      state: 'UNAUTHORIZED',
      error: 'Token de autenticação vazio.'
    });
  }

  try {
    const db = getDb();
    const currentApp = getApps()[0] || firebaseAdminApp;
    if (!currentApp) {
      throw new Error('Firebase Admin App not initialized');
    }
    const decodedToken = await getAuth(currentApp).verifyIdToken(idToken);
    const uid = decodedToken.uid;

    let isAdmin = Boolean(decodedToken.admin);
    if (!isAdmin) {
      const adminDoc = await db.collection('admins').doc(uid).get().catch(() => null);
      if (adminDoc && adminDoc.exists) {
        isAdmin = true;
      }
    }

    if (!isAdmin && decodedToken.email === 'pedroigooralves@gmail.com') {
      isAdmin = true;
      await db.collection('admins').doc(uid).set({
        uid,
        email: decodedToken.email,
        role: 'superadmin',
        createdAt: new Date().toISOString()
      }, { merge: true }).catch(() => {});
    }

    if (!isAdmin) {
      return res.status(403).json({
        success: false,
        state: 'FORBIDDEN',
        error: 'Acesso negado: o usuário não possui privilégios de administrador na coleção admins.'
      });
    }

    (req as any).adminUser = decodedToken;
    next();
  } catch (err: any) {
    console.error('Admin token verification failed:', err?.message || err);
    return res.status(401).json({
      success: false,
      state: 'UNAUTHORIZED',
      error: 'Token inválido ou expirado.'
    });
  }
}


export const FIXED_PIX_CODE = '00020126720014BR.GOV.BCB.PIX013639fe1e46-001d-499e-8bbd-4bd9a0746e6d0210Vitalicio 5204000053039865406239.905802BR5925PEDRO IGOR ALVES DA SILVA6009SAO PAULO622605224XFv7wymjQUh3OViUZlCx56304A298';
export const FIXED_QR_CODE_IMAGE = 'https://i.ibb.co/HfyQkFbT/image.png';

// Generate 7-day HMAC token for offline validation in Android APK
function generateToken(key: string, deviceId: string): { token: string; expiresAt: string } {
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const payload = {
    device_id: deviceId,
    license_key: key,
    issued_at: new Date().toISOString(),
    expires_at: expiresAt
  };
  const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = crypto.createHmac('sha256', HMAC_SECRET).update(payloadStr).digest('hex');
  const token = `${payloadStr}.${signature}`;
  return { token, expiresAt };
}

function verifyToken(key: string, deviceId: string, tokenStr: string): { valid: boolean; reason?: string } {
  try {
    if (!tokenStr) return { valid: false, reason: 'Token ausente' };
    
    if (tokenStr.includes('.')) {
      const [payloadStr, signature] = tokenStr.split('.');
      const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(payloadStr).digest('hex');
      if (expectedSig !== signature) return { valid: false, reason: 'Assinatura inválida' };
      const payload = JSON.parse(Buffer.from(payloadStr, 'base64').toString('utf8'));
      if (deviceId && payload.device_id !== deviceId) {
        return { valid: false, reason: 'Dispositivo divergente' };
      }
      if (key && payload.license_key !== key) {
        return { valid: false, reason: 'Chave divergente' };
      }
      if (new Date(payload.expires_at).getTime() < Date.now()) {
        return { valid: false, reason: 'Token expirado' };
      }
      return { valid: true };
    } else {
      const decoded = JSON.parse(Buffer.from(tokenStr, 'base64').toString('utf8'));
      const [tKey, tDev, tExp] = (decoded.payload || '').split(':');
      if ((key && tKey !== key) || (deviceId && tDev !== deviceId) || Number(tExp) < Date.now()) {
        return { valid: false, reason: 'Token expirado ou divergente' };
      }
      const expectedSig = crypto.createHmac('sha256', HMAC_SECRET).update(decoded.payload).digest('hex');
      if (expectedSig !== decoded.signature) return { valid: false, reason: 'Assinatura inválida' };
      return { valid: true };
    }
  } catch (e: any) {
    return { valid: false, reason: e.message };
  }
}

// Firestore Query Helpers
async function findLicenseByKey(db: Firestore, key: string): Promise<any> {
  if (!key) return null;
  const docSnap = await db.collection('licenses').doc(`lic_${key}`).get().catch(() => null);
  if (docSnap && docSnap.exists) {
    return { id: docSnap.id, ...(docSnap.data() as any) };
  }
  const directDoc = await db.collection('licenses').doc(key).get().catch(() => null);
  if (directDoc && directDoc.exists) {
    return { id: directDoc.id, ...(directDoc.data() as any) };
  }
  const querySnap = await db.collection('licenses').where('key', '==', key).limit(1).get().catch(() => null);
  if (querySnap && !querySnap.empty) {
    const doc = querySnap.docs[0];
    return { id: doc.id, ...(doc.data() as any) };
  }
  return null;
}

async function findLicensesByDeviceId(db: Firestore, deviceId: string): Promise<any[]> {
  if (!deviceId) return [];
  const querySnap = await db.collection('licenses').where('deviceId', '==', deviceId).get().catch(() => null);
  if (querySnap && !querySnap.empty) {
    return querySnap.docs.map(d => ({ id: d.id, ...(d.data() as any) }));
  }
  return [];
}

async function findTrialByDeviceId(db: Firestore, deviceId: string): Promise<any> {
  if (!deviceId) return null;
  const docSnap = await db.collection('trials').doc(`trial_${deviceId}`).get().catch(() => null);
  if (docSnap && docSnap.exists) {
    return { id: docSnap.id, ...(docSnap.data() as any) };
  }
  const querySnap = await db.collection('trials').where('deviceId', '==', deviceId).limit(1).get().catch(() => null);
  if (querySnap && !querySnap.empty) {
    const doc = querySnap.docs[0];
    return { id: doc.id, ...(doc.data() as any) };
  }
  const querySnapSnake = await db.collection('trials').where('device_id', '==', deviceId).limit(1).get().catch(() => null);
  if (querySnapSnake && !querySnapSnake.empty) {
    const doc = querySnapSnake.docs[0];
    return { id: doc.id, ...(doc.data() as any) };
  }
  return null;
}

export const apiRouter = express.Router();

// CORS and response formatting middleware
apiRouter.use((req: any, res: any, next: any) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS, HEAD');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With, X-App-Token, Accept');
  
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    return res.end();
  }

  if (typeof res.status !== 'function') {
    res.status = function (code: number) {
      res.statusCode = code;
      return res;
    };
  }

  if (typeof res.json !== 'function') {
    res.json = function (data: any) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json; charset=utf-8');
      }
      res.end(JSON.stringify(data));
      return res;
    };
  }

  if (typeof res.send !== 'function') {
    res.send = function (body: any) {
      if (typeof body === 'object') {
        return res.json(body);
      }
      res.end(String(body));
      return res;
    };
  }

  next();
});

/**
 * Parse do corpo da requisição à prova de falhas:
 * Trata casos de corpo vazio, retries do app Android ou parsing prévio na Vercel/Express.
 */
export function parseBody(req: Request): Record<string, any> {
  let body = (req as any).body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body.trim() || '{}');
    } catch (e) {
      body = {}; // Se falhar, assume objeto vazio para não quebrar o servidor
    }
  } else if (!body || typeof body !== 'object') {
    body = {};
  }
  return body;
}

// Middleware de normalização do corpo da requisição
apiRouter.use((req: any, res: any, next: any) => {
  let body = req.body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body.trim() || '{}');
    } catch (e) {
      body = {};
    }
  } else if (!body || typeof body !== 'object') {
    body = {};
  }
  req.body = body;
  next();
});

/* ==========================================================================
   2.8 POST /api/ai/chat
   Endpoint para respostas automáticas de IA do Whats Responder.
   Suporta OpenAI (dinâmico), NVIDIA NIM, OpenRouter e Google Gemini com fallback inteligente.
   ========================================================================== */
apiRouter.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const message = body.message || body.prompt || body.text || '';
    
    // Fetch AI context from Firestore
    const db = getDb();
    const settingsDoc = await db.collection('settings').doc('ai_context').get();
    const aiContext = settingsDoc.exists ? (settingsDoc.data() as any).context : '';
    
    const baseSystemPrompt = 'Você é um assistente virtual inteligente e prestativo para WhatsApp (Whats Responder). Responda de forma clara, educada, concisa e amigável em português. Se você não souber responder com base nas informações abaixo, responda APENAS "HUMAN_NEEDED".';
    const systemPrompt = `${baseSystemPrompt}\n\nINFORMAÇÕES DA EMPRESA:\n${aiContext}`;

    let messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
      // Prepend system prompt to the first message if it's a system role, otherwise add it
      if (messages[0]?.role === 'system') {
        messages[0].content = `${systemPrompt}\n\n${messages[0].content}`;
      } else {
        messages.unshift({ role: 'system', content: systemPrompt });
      }
    } else if (message) {
      messages = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: String(message) }
      ];
    } else {
      return res.status(400).json({ success: false, error: 'Mensagem não fornecida. Envie "message" ou "messages".' });
    }

    let reply = '';

    // 1. Provedor OpenAI via importação dinâmica
    if ((process.env.OPENAI_API_KEY || process.env.OPENAI_KEY) && !reply) {
      try {
        const { default: OpenAI } = await import('openai');
        const openai = new OpenAI({
          apiKey: process.env.OPENAI_API_KEY || process.env.OPENAI_KEY
        });
        const openaiModel = body.model || process.env.OPENAI_MODEL || 'gpt-4o-mini';
        const completion = await openai.chat.completions.create({
          model: openaiModel,
          messages: messages as any,
          temperature: 0.7,
          max_tokens: 1024
        });
        reply = completion.choices?.[0]?.message?.content || '';
      } catch (err: any) {
        console.error('OpenAI API error:', err?.message || err);
      }
    }

    // 2. Provedor NVIDIA NIM se configurado
    if (process.env.NVIDIA_API_KEY && !reply) {
      try {
        const nvidiaModel = body.model || 'meta/llama-3.1-8b-instruct';
        const nvidiaRes = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.NVIDIA_API_KEY}`
          },
          body: JSON.stringify({
            model: nvidiaModel,
            messages,
            temperature: 0.7,
            max_tokens: 1024
          })
        });

        if (nvidiaRes.ok) {
          const data: any = await nvidiaRes.json();
          reply = data?.choices?.[0]?.message?.content || '';
        } else {
          console.warn('NVIDIA API status:', nvidiaRes.status);
        }
      } catch (err: any) {
        console.error('NVIDIA API error:', err?.message || err);
      }
    }

    // 3. Provedor OpenRouter se configurado
    if (process.env.OPENROUTER_API_KEY && !reply) {
      try {
        const openrouterModel = body.model || 'meta-llama/llama-3.2-3b-instruct';
        const openrouterRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'HTTP-Referer': 'https://whatstransmissao.vercel.app',
            'X-Title': 'Whats Responder'
          },
          body: JSON.stringify({
            model: openrouterModel,
            messages,
            temperature: 0.7,
            max_tokens: 1024
          })
        });

        if (openrouterRes.ok) {
          const data: any = await openrouterRes.json();
          reply = data?.choices?.[0]?.message?.content || '';
        } else {
          console.warn('OpenRouter API status:', openrouterRes.status);
        }
      } catch (err: any) {
        console.error('OpenRouter API error:', err?.message || err);
      }
    }

    // 4. Provedor Google Gemini se configurado
    if (process.env.GEMINI_API_KEY && !reply) {
      try {
        const { GoogleGenAI } = await import('@google/genai');
        const ai = new GoogleGenAI({ 
          apiKey: process.env.GEMINI_API_KEY,
          httpOptions: { headers: { 'User-Agent': 'aistudio-build' } }
        });

        const filteredMessages = messages.filter(m => m.role !== 'system');
        const contents = filteredMessages.map(m => ({
          role: (m.role === 'assistant' || m.role === 'model') ? 'model' : 'user',
          parts: [{ text: m.content }]
        }));

        const geminiRes = await ai.models.generateContent({
          model: 'gemini-3.8-flash',
          contents,
          config: {
            systemInstruction: systemPrompt
          }
        });

        reply = geminiRes.text || '';
      } catch (err: any) {
        console.error('Gemini API error:', err?.message || err);
      }
    }

    // 5. Fallback padrão se nenhuma chave estiver configurada ou se houver falha
    if (!reply) {
      reply = `Olá! Recebemos sua mensagem: "${String(message).substring(0, 60)}". Esta é uma resposta automática do Whats Responder. Em breve entraremos em contato com você!`;
    }

    return res.status(200).json({
      success: true,
      reply,
      message: reply,
      text: reply,
      choices: [
        {
          message: {
            role: 'assistant',
            content: reply
          }
        }
      ]
    });
  } catch (error: any) {
    console.error('AI chat endpoint error:', error);
    return res.status(500).json({ success: false, error: 'Erro no endpoint de IA: ' + error.message });
  }
});

/* ==========================================================================
   2.9 Settings Endpoints (AI Context)
   ========================================================================== */
apiRouter.get('/api/settings/get', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const doc = await db.collection('settings').doc('ai_context').get();
    return res.json({ success: true, data: doc.exists ? doc.data() : { context: '' } });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/settings/save', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { context } = body;
    const db = getDb();
    await db.collection('settings').doc('ai_context').set({ context, updatedAt: new Date().toISOString() });
    return res.json({ success: true, message: 'Configurações de IA salvas com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});
``` 
