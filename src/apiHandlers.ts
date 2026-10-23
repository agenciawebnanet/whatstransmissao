import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import { initializeApp, getApps, cert } from 'firebase-admin/app';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import crypto from 'crypto';

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
    });w
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

export function parseBody(req: Request): Record<string, any> {
  let body = (req as any).body;
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body.trim() || '{}');
    } catch (e) {
      body = {};
    }
  } else if (!body || typeof body !== 'object') {
    body = {};
  }
  return body;
}

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

apiRouter.post('/api/trial/start', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const devId = (body.device_id || body.deviceId || body.installation_uuid || body.installationUuid || '').trim();
    const appId = (body.app_id || body.appId || 'whatstransmissao').trim();
    const deviceInfo = body.device_info || body.deviceInfo || 'Dispositivo Android';

    if (!devId) {
      return res.status(400).json({ success: false, error: 'device_id é obrigatório.' });
    }

    const db = getDb();
    const now = new Date();
    const nowIso = now.toISOString();

    const devLicenses = await findLicensesByDeviceId(db, devId);
    const blockedLic = devLicenses.find((l: any) => l.status === 'bloqueada' || l.status === 'revogada');
    if (blockedLic) {
      return res.status(403).json({
        success: false,
        state: 'LICENSE_BLOCKED',
        message: 'Dispositivo bloqueado pela administração.'
      });
    }

    const activeLic = devLicenses.find((l: any) => l.status === 'ativa');
    if (activeLic) {
      return res.json({
        success: true,
        state: 'LICENSE_ACTIVE',
        license_key: activeLic.key,
        message: 'Dispositivo já possui licença vitalícia ativa.'
      });
    }

    const existingTrial: any = await findTrialByDeviceId(db, devId);
    if (existingTrial) {
      const startedAt = existingTrial.trialStartedAt || existingTrial.trial_started_at || nowIso;
      const expAt = existingTrial.trialExpiresAt || existingTrial.trial_expires_at || new Date(now.getTime() + 120 * 60 * 1000).toISOString();
      const expiresAt = new Date(expAt);
      const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
      const state = remainingSeconds > 0 ? 'TRIAL_ACTIVE' : 'TRIAL_EXPIRED';

      await db.collection('trials').doc(existingTrial.id || `trial_${devId}`).set({
        status: state,
        deviceId: devId,
        device_id: devId,
        trialStartedAt: startedAt,
        trial_started_at: startedAt,
        trialExpiresAt: expAt,
        trial_expires_at: expAt,
        lastCheckedAt: nowIso,
        last_checked_at: nowIso,
        appId: appId,
        app_id: appId
      }, { merge: true }).catch(() => {});

      return res.json({
        success: true,
        state,
        trial_started_at: startedAt,
        trialStartedAt: startedAt,
        trial_expires_at: expAt,
        trialExpiresAt: expAt,
        remaining_seconds: remainingSeconds,
        message: state === 'TRIAL_ACTIVE'
          ? `Teste gratuito ativo! Restam ${Math.floor(remainingSeconds / 60)} minutos.`
          : 'O período de teste gratuito de 2 horas expirou.'
      });
    }

    const expiresAt = new Date(now.getTime() + 120 * 60 * 1000);
    const expIso = expiresAt.toISOString();
    const newTrial = {
      id: `trial_${devId}`,
      deviceId: devId,
      device_id: devId,
      installationUuid: devId,
      installation_uuid: devId,
      status: 'TRIAL_ACTIVE',
      trialStartedAt: nowIso,
      trial_started_at: nowIso,
      trialExpiresAt: expIso,
      trial_expires_at: expIso,
      lastCheckedAt: nowIso,
      last_checked_at: nowIso,
      deviceInfo,
      device_info: deviceInfo,
      createdAt: nowIso,
      created_at: nowIso,
      appId: appId,
      app_id: appId
    };

    await db.collection('trials').doc(newTrial.id).set(newTrial);

    return res.json({
      success: true,
      state: 'TRIAL_ACTIVE',
      trial_started_at: nowIso,
      trialStartedAt: nowIso,
      trial_expires_at: expIso,
      trialExpiresAt: expIso,
      remaining_seconds: 7200,
      message: 'Teste gratuito de 2 horas iniciado com sucesso!'
    });
  } catch (error: any) {
    console.error('Trial start error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao iniciar teste gratuito: ' + error.message });
  }
});

apiRouter.post('/api/trial/status', async (req: Request, res: Response) => {
  try {
    const serverTime = new Date().toISOString();
    const now = new Date();
    const body = parseBody(req);
    const devId = (body.device_id || body.deviceId || body.installation_uuid || body.installationUuid || '').trim();
    const licKey = (body.license_key || body.licenseKey || body.key || '').trim();

    if (!devId && !licKey) {
      return res.status(400).json({
        success: false,
        error: 'device_id ou license_key é obrigatório.',
        state: 'UNKNOWN',
        remaining_seconds: 0,
        trial_expires_at: null,
        license_key: '',
        server_time: serverTime
      });
    }

    const db = getDb();

    if (licKey) {
      const lic: any = await findLicenseByKey(db, licKey);
      if (lic) {
        if (lic.status === 'bloqueada' || lic.status === 'revogada') {
          return res.json({
            success: false,
            state: 'LICENSE_BLOCKED',
            remaining_seconds: 0,
            trial_expires_at: null,
            license_key: licKey,
            server_time: serverTime
          });
        }
        if (lic.status === 'ativa' && (!lic.deviceId || lic.deviceId === devId)) {
          return res.json({
            success: true,
            state: 'LICENSE_ACTIVE',
            remaining_seconds: 0,
            trial_expires_at: null,
            license_key: licKey,
            server_time: serverTime
          });
        }
      }
    }

    if (devId) {
      const devLicenses = await findLicensesByDeviceId(db, devId);
      const blockedLic = devLicenses.find((l: any) => l.status === 'bloqueada' || l.status === 'revogada');
      if (blockedLic) {
        return res.json({
          success: false,
          state: 'LICENSE_BLOCKED',
          remaining_seconds: 0,
          trial_expires_at: null,
          license_key: blockedLic.key || licKey,
          server_time: serverTime
        });
      }

      const activeLic = devLicenses.find((l: any) => l.status === 'ativa');
      if (activeLic) {
        return res.json({
          success: true,
          state: 'LICENSE_ACTIVE',
          remaining_seconds: 0,
          trial_expires_at: null,
          license_key: activeLic.key || licKey,
          server_time: serverTime
        });
      }

      const trial: any = await findTrialByDeviceId(db, devId);
      if (trial) {
        const expAt = trial.trialExpiresAt || trial.trial_expires_at || serverTime;
        const expiresAt = new Date(expAt);
        const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        const state = remainingSeconds > 0 ? 'TRIAL_ACTIVE' : 'TRIAL_EXPIRED';

        await db.collection('trials').doc(trial.id || `trial_${devId}`).set({
          status: state,
          lastCheckedAt: serverTime,
          last_checked_at: serverTime
        }, { merge: true }).catch(() => {});

        return res.json({
          success: true,
          state,
          remaining_seconds: remainingSeconds,
          trial_expires_at: expAt,
          trialExpiresAt: expAt,
          license_key: licKey,
          server_time: serverTime
        });
      }
    }

    return res.json({
      success: true,
      state: 'UNKNOWN',
      remaining_seconds: 0,
      trial_expires_at: null,
      license_key: licKey,
      server_time: serverTime
    });
  } catch (error: any) {
    console.error('Trial status error:', error);
    return res.json({
      success: true,
      state: 'UNKNOWN',
      remaining_seconds: 0,
      trial_expires_at: null,
      license_key: '',
      server_time: new Date().toISOString()
    });
  }
});

apiRouter.post('/api/license/activate', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const licKey = (body.key || body.license_key || body.licenseKey || '').trim();
    const devId = (body.device_id || body.deviceId || '').trim();
    const appId = (body.app_id || body.appId || 'whatstransmissao').trim();
    const deviceInfo = body.device_info || body.deviceInfo || 'Dispositivo Android';

    if (!devId) {
      return res.status(400).json({
        success: false,
        error: 'device_id é obrigatório.',
        state: 'INVALID_DEVICE',
        message: 'O device_id é obrigatório.'
      });
    }

    if (!licKey) {
      return res.status(400).json({
        success: false,
        error: 'Chave de licença é obrigatória.',
        state: 'INVALID_KEY',
        message: 'A chave de licença é obrigatória.'
      });
    }

    const db = getDb();
    const license: any = await findLicenseByKey(db, licKey);
    if (!license) {
      return res.status(400).json({
        success: false,
        state: 'INVALID_KEY',
        message: 'Chave de licença inválida ou inexistente.'
      });
    }

    if (license.status === 'bloqueada' || license.status === 'revogada') {
      return res.status(403).json({
        success: false,
        state: 'LICENSE_BLOCKED',
        message: 'Esta licença foi bloqueada ou revogada pela administração.'
      });
    }

    if (license.deviceId && license.deviceId !== devId) {
      return res.status(409).json({
        success: false,
        state: 'LICENSE_IN_USE',
        message: 'Esta licença já está ativa em outro dispositivo. Solicite transferência ao suporte.'
      });
    }

    const devLicenses = await findLicensesByDeviceId(db, devId);
    const otherDevLic = devLicenses.find((l: any) => l.status === 'ativa' && l.key !== licKey);
    if (otherDevLic) {
      return res.status(409).json({
        success: false,
        state: 'DEVICE_ALREADY_LICENSED',
        message: 'Este dispositivo já possui outra licença ativa.'
      });
    }

    const now = new Date().toISOString();
    const { token, expiresAt } = generateToken(licKey, devId);

    const targetDocId = license.id || `lic_${licKey}`;
    await db.collection('licenses').doc(targetDocId).set({
      deviceId: devId,
      deviceInfo: deviceInfo || license.deviceInfo || 'Dispositivo Android',
      status: 'ativa',
      activatedAt: license.activatedAt || now,
      lastValidatedAt: now,
      currentToken: token,
      appId: license.appId || license.app_id || appId,
      app_id: license.app_id || license.appId || appId
    }, { merge: true });

    await db.collection('trials').doc(`trial_${devId}`).set({
      status: 'CONVERTED_TO_LICENSE',
      lastCheckedAt: now
    }, { merge: true }).catch(() => {});

    return res.status(200).json({
      success: true,
      state: 'LICENSE_ACTIVE',
      license_key: licKey,
      activated_at: license.activatedAt || now,
      token,
      expires_at: expiresAt,
      message: 'Licença ativada com sucesso.'
    });
  } catch (error: any) {
    console.error('License activate error:', error);
    return res.status(500).json({
      success: false,
      state: 'SERVER_ERROR',
      message: 'Erro interno ao processar ativação: ' + error.message
    });
  }
});

apiRouter.post('/api/license/validate', async (req: Request, res: Response) => {
  try {
    const serverTime = new Date().toISOString();
    const body = parseBody(req);
    const licKey = (body.key || body.license_key || body.licenseKey || '').trim();
    const devId = (body.device_id || body.deviceId || '').trim();
    const token = body.token || '';

    if (!devId) {
      return res.status(400).json({ success: false, state: 'INVALID_REQUEST', message: 'device_id é obrigatório.', error: 'device_id é obrigatório.' });
    }

    if (token) {
      const tokenVerification = verifyToken(licKey, devId, token);
      if (!tokenVerification.valid) {
        if (tokenVerification.reason?.includes('Dispositivo')) {
          return res.status(403).json({ success: false, state: 'DEVICE_MISMATCH', message: 'Dispositivo divergente do token.' });
        }
      }
    }

    const db = getDb();
    let license: any = null;

    if (licKey) {
      license = await findLicenseByKey(db, licKey);
    }
    if (!license && devId) {
      const devLicenses = await findLicensesByDeviceId(db, devId);
      license = devLicenses.find((l: any) => l.status === 'ativa');
    }

    if (!license && token) {
      const tokenCheck = verifyToken(licKey, devId, token);
      if (tokenCheck.valid) {
        const { token: renewedToken, expiresAt } = generateToken(licKey || 'OFFLINE_VALIDATED', devId);
        return res.json({
          success: true,
          state: 'LICENSE_ACTIVE',
          license_key: licKey,
          token: renewedToken,
          expires_at: expiresAt,
          server_time: serverTime
        });
      }
    }

    if (!license) {
      return res.status(400).json({ success: false, state: 'INVALID_KEY', message: 'Licença não encontrada.' });
    }

    if (license.status === 'bloqueada' || license.status === 'revogada') {
      return res.status(403).json({ success: false, state: 'LICENSE_BLOCKED', message: 'Licença bloqueada ou revogada pelo administrador.' });
    }

    if (license.deviceId && license.deviceId !== devId) {
      return res.status(403).json({ success: false, state: 'DEVICE_MISMATCH', message: 'Dispositivo não autorizado para esta chave.' });
    }

    const { token: newToken, expiresAt: newExpiresAt } = generateToken(license.key, devId);
    await db.collection('licenses').doc(license.id || `lic_${license.key}`).set({
      lastValidatedAt: serverTime,
      currentToken: newToken
    }, { merge: true });

    return res.json({
      success: true,
      state: 'LICENSE_ACTIVE',
      license_key: license.key,
      token: newToken,
      expires_at: newExpiresAt,
      server_time: serverTime
    });
  } catch (error: any) {
    console.error('License validate error:', error);
    return res.status(500).json({
      success: false,
      state: 'SERVER_ERROR',
      message: 'Erro interno ao validar licença: ' + error.message
    });
  }
});

apiRouter.post('/api/pix/create', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const devId = (body.device_id || body.deviceId || '').trim();
    const application = (body.app_id || body.appId || 'whatstransmissao').trim();
    const numericAmount = typeof body.amount === 'number' ? body.amount : (parseFloat(body.amount) || 239.90);
    const resolvedClientName = body.clientName || body.client_name || (devId ? `APK Android (${devId.substring(0, 8)})` : 'Cliente Pix');
    const description = body.description || '';

    if (!devId) {
      return res.status(400).json({ success: false, error: 'device_id é obrigatório para gerar o pedido Pix.' });
    }

    const db = getDb();
    const orderId = `ord_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const now = new Date().toISOString();

    const orderRecord = {
      orderId,
      id: orderId,
      deviceId: devId,
      device_id: devId,
      clientId: devId,
      clientName: resolvedClientName,
      amount: numericAmount,
      description: description || (application === 'whatsresponder' ? 'Licença vitalícia Whats Responder' : 'Licença vitalícia WhatsTransmissão PRO'),
      status: 'PENDING',
      pixPayload: FIXED_PIX_CODE,
      pix_code: FIXED_PIX_CODE,
      pixQrCode: FIXED_QR_CODE_IMAGE,
      createdAt: now,
      expiresAt,
      licenseKey: null,
      paidAt: null,
      appId: application,
      app_id: application
    };

    const saleRecord = {
      id: orderId,
      clientId: devId,
      clientName: resolvedClientName,
      product: application === 'whatsresponder' ? 'Whats Responder - Vitalício' : 'WhatsTransmissão PRO - Vitalício',
      amount: numericAmount,
      status: 'pendente',
      paymentMethod: 'Pix Oficial',
      pixCode: FIXED_PIX_CODE,
      pagseguroOrderId: orderId,
      createdAt: now,
      paidAt: null,
      appId: application,
      app_id: application
    };

    await db.collection('orders').doc(orderId).set(orderRecord);
    await db.collection('sales').doc(orderId).set(saleRecord);

    return res.status(200).json({
      success: true,
      order_id: orderId,
      pix_payload: FIXED_PIX_CODE,
      pix_qr_code: FIXED_QR_CODE_IMAGE,
      expires_at: expiresAt,
      status: 'PENDING'
    });
  } catch (error: any) {
    console.error('Pix create error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar pedido Pix: ' + error.message });
  }
});

const handleGetOrder = async (req: Request, res: Response) => {
  try {
    const orderId = (req.params.order_id || (req.query.order_id as string) || '').trim();
    if (!orderId) {
      return res.status(400).json({ success: false, error: 'ID do pedido obrigatório.' });
    }

    const db = getDb();
    let orderData: any = null;

    const orderDoc = await db.collection('orders').doc(orderId).get().catch(() => null);
    if (orderDoc && orderDoc.exists) {
      orderData = orderDoc.data();
    } else {
      const saleDoc = await db.collection('sales').doc(orderId).get().catch(() => null);
      if (saleDoc && saleDoc.exists) {
        orderData = saleDoc.data();
      }
    }

    if (!orderData) {
      return res.status(404).json({ success: false, error: 'Pedido não encontrado.' });
    }

    const isPaid = orderData.status === 'PAID' || orderData.status === 'pago';
    if (isPaid) {
      let key = orderData.licenseKey;
      if (!key) {
        const licSnap = await db.collection('licenses').where('saleId', '==', orderId).limit(1).get().catch(() => null);
        if (licSnap && !licSnap.empty) {
          key = licSnap.docs[0].data()?.key;
        }
      }
      return res.json({
        success: true,
        order_id: orderId,
        status: 'PAID',
        paid_at: orderData.paidAt || new Date().toISOString(),
        license_key: key || 'WST-PRO-PENDING-ACTIVATION'
      });
    }

    if (orderData.status === 'CANCELLED' || orderData.status === 'cancelado') {
      return res.json({
        success: false,
        order_id: orderId,
        status: 'CANCELLED',
        message: 'Pedido cancelado.'
      });
    }

    return res.json({
      success: true,
      order_id: orderId,
      status: 'PENDING',
      message: 'Aguardando confirmação do pagamento Pix.'
    });
  } catch (error: any) {
    console.error('Get order error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao consultar pedido: ' + error.message });
  }
};

apiRouter.get('/api/order/:order_id', handleGetOrder);
apiRouter.get('/api/order', handleGetOrder);

apiRouter.post('/api/order/confirm-manual', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const targetId = (body.order_id || body.orderId || body.id || '').trim();
    if (!targetId) {
      return res.status(400).json({ success: false, error: 'ID do pedido é obrigatório.' });
    }

    const db = getDb();
    const now = new Date().toISOString();
    const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
    const newLicenseKey = `WST-PRO-${randomPart()}-${randomPart()}-${randomPart()}`;

    let deviceId = '';
    let clientName = 'Cliente Android';
    let appId = 'whatstransmissao';

    const orderDoc = await db.collection('orders').doc(targetId).get().catch(() => null);
    if (orderDoc && orderDoc.exists) {
      const data = orderDoc.data();
      deviceId = data?.deviceId || '';
      appId = data?.app_id || data?.appId || appId;
    }

    const saleDoc = await db.collection('sales').doc(targetId).get().catch(() => null);
    if (saleDoc && saleDoc.exists) {
      const data = saleDoc.data();
      deviceId = deviceId || data?.clientId || '';
      clientName = data?.clientName || clientName;
      appId = data?.app_id || data?.appId || appId;
    }

    const hasDevice = Boolean(deviceId && deviceId !== 'android-user');
    let token = null;
    if (hasDevice) {
      token = generateToken(newLicenseKey, deviceId).token;
    }

    const newLicense = {
      id: `lic_${targetId}`,
      key: newLicenseKey,
      clientId: deviceId || targetId,
      clientName,
      saleId: targetId,
      status: hasDevice ? 'ativa' : 'inativa',
      deviceId: hasDevice ? deviceId : null,
      deviceInfo: hasDevice ? 'Android APK (Zero-Touch)' : 'Android APK',
      activatedAt: hasDevice ? now : null,
      lastValidatedAt: hasDevice ? now : null,
      currentToken: token,
      createdAt: now,
      appId,
      app_id: appId
    };

    if (hasDevice) {
      await db.collection('trials').doc(`trial_${deviceId}`).set({
        status: 'CONVERTED_TO_LICENSE',
        lastCheckedAt: now,
        appId,
        app_id: appId
      }, { merge: true }).catch(() => {});
    }

    await db.collection('orders').doc(targetId).set({
      orderId: targetId,
      status: 'PAID',
      paidAt: now,
      licenseKey: newLicenseKey,
      deviceId: deviceId || null,
      appId,
      app_id: appId
    }, { merge: true });

    await db.collection('sales').doc(targetId).set({
      id: targetId,
      clientId: deviceId || 'android-user',
      clientName,
      product: appId === 'whatsresponder' ? 'Whats Responder - Vitalício' : 'WhatsTransmissão PRO - Vitalício',
      amount: 239.90,
      status: 'pago',
      paymentMethod: 'Pix Oficial',
      pixCode: FIXED_PIX_CODE,
      pagseguroOrderId: targetId,
      createdAt: now,
      paidAt: now,
      appId,
      app_id: appId
    }, { merge: true });

    await db.collection('licenses').doc(newLicense.id).set(newLicense);

    return res.json({
      success: true,
      order_id: targetId,
      status: 'PAID',
      license_key: newLicenseKey,
      message: 'Pagamento Pix confirmado manualmente e licença gerada com sucesso!'
    });
  } catch (error: any) {
    console.error('Confirm manual error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao confirmar pedido: ' + error.message });
  }
});

apiRouter.post('/api/client/save', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { id, name, email, phone } = body;
    if (!name || !email) return res.status(400).json({ success: false, error: 'Nome e e-mail são obrigatórios.' });
    const now = new Date().toISOString();
    const targetId = id || `client_${Date.now()}`;
    const clientData = {
      id: targetId,
      name,
      email,
      phone: phone || '',
      updatedAt: now,
      createdAt: now
    };
    const db = getDb();
    await db.collection('clients').doc(targetId).set(clientData, { merge: true });
    return res.json({ success: true, message: 'Cliente salvo com sucesso', id: targetId });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/client/delete', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { client_id, id } = body;
    const targetId = client_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID do cliente obrigatório' });
    const db = getDb();
    await db.collection('clients').doc(targetId).delete();
    return res.json({ success: true, message: 'Cliente excluído com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/sale/delete', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { sale_id, id } = body;
    const targetId = sale_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID da venda obrigatório' });
    const db = getDb();
    await db.collection('sales').doc(targetId).delete();
    await db.collection('orders').doc(targetId).delete().catch(() => {});
    return res.json({ success: true, message: 'Venda excluída com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/license/delete', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { license_id, id, key } = body;
    const targetId = license_id || id || key;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID da licença obrigatório' });
    const db = getDb();
    const lic: any = await findLicenseByKey(db, targetId);
    if (lic) {
      await db.collection('licenses').doc(lic.id || targetId).delete();
    } else {
      await db.collection('licenses').doc(targetId).delete().catch(() => {});
    }
    return res.json({ success: true, message: 'Licença excluída com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/trial/delete', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { trial_id, id, device_id } = body;
    const targetId = trial_id || id || device_id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID do teste obrigatório' });
    const db = getDb();
    await db.collection('trials').doc(targetId).delete().catch(() => {});
    await db.collection('trials').doc(`trial_${targetId}`).delete().catch(() => {});
    return res.json({ success: true, message: 'Teste excluído com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/license/deactivate', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { key, license_key } = body;
    const licKey = (key || license_key || '').trim();
    if (!licKey) return res.status(400).json({ success: false, error: 'Chave obrigatória.' });

    const db = getDb();
    const license: any = await findLicenseByKey(db, licKey);
    if (!license) return res.status(404).json({ success: false, error: 'Licença não encontrada.' });

    await db.collection('licenses').doc(license.id || `lic_${licKey}`).set({
      deviceId: null,
      deviceInfo: null,
      status: 'inativa',
      lastValidatedAt: new Date().toISOString()
    }, { merge: true });

    return res.json({ success: true, message: 'Licença desvinculada do dispositivo com sucesso.' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/payment/create-pix', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const { sale_id } = body;
    const orderId = sale_id || `PIX-${Date.now()}`;
    return res.json({
      success: true,
      provider: 'Pix Oficial (Pedro Igor Alves da Silva - R$ 239,90)',
      order_id: orderId,
      pix_code: FIXED_PIX_CODE,
      qr_code_image: FIXED_QR_CODE_IMAGE,
      message: 'Pix gerado com sucesso.'
    });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/ai/chat', async (req: Request, res: Response) => {
  try {
    const body = parseBody(req);
    const message = body.message || body.prompt || body.text || '';
    
    const db = getDb();
    const settingsDoc = await db.collection('settings').doc('ai_context').get();
    const aiContext = settingsDoc.exists ? (settingsDoc.data() as any).context : '';
    
    const baseSystemPrompt = 'Você é um assistente virtual inteligente e prestativo para WhatsApp (Whats Responder). Responda de forma clara, educada, concisa e amigável em português. Se você não souber responder com base nas informações abaixo, responda APENAS "HUMAN_NEEDED".';
    const systemPrompt = `${baseSystemPrompt}\n\nINFORMAÇÕES DA EMPRESA:\n${aiContext}`;

    let messages: Array<{ role: string; content: string }> = [];
    if (Array.isArray(body.messages) && body.messages.length > 0) {
      messages = body.messages;
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
