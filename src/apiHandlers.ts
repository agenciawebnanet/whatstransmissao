import express, { Request, Response } from 'express';
import * as adminNamespace from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import crypto from 'crypto';
import fetch from 'node-fetch';
import firebaseConfig from '../firebase-applet-config.json';

const admin: any = (adminNamespace as any).default || adminNamespace;

try {
  if (admin && (!admin.apps || !admin.apps.length)) {
    admin.initializeApp({
      projectId: firebaseConfig.projectId || process.env.FIREBASE_PROJECT_ID || 'gen-lang-client-0919034007'
    });
  }
} catch (e) {
  console.warn('Admin init notice:', e);
}

const getDb = () => {
  try {
    return getFirestore(firebaseConfig.firestoreDatabaseId || 'ai-studio-56f22fec-68b1-4f1c-9084-ced03b254908');
  } catch (e) {
    try {
      return getFirestore();
    } catch (err) {
      console.error('getFirestore error:', err);
      return null;
    }
  }
};

const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PAGSEGURO_TOKEN = process.env.PAGSEGURO_TOKEN || '';
const PAGSEGURO_SANDBOX = process.env.PAGSEGURO_SANDBOX === 'true';

const FIXED_PIX_CODE = '00020126720014BR.GOV.BCB.PIX013639fe1e46-001d-499e-8bbd-4bd9a0746e6d0210Vitalicio 5204000053039865406239.905802BR5925PEDRO IGOR ALVES DA SILVA6009SAO PAULO622605224XFv7wymjQUh3OViUZlCx56304A298';
const FIXED_QR_CODE_IMAGE = 'https://i.ibb.co/HfyQkFbT/image.png';

function generateToken(key: string, deviceId: string): { token: string; expiry: number } {
  const expiry = Date.now() + 30 * 24 * 60 * 60 * 1000; // 30 days
  const payload = `${key}:${deviceId}:${expiry}`;
  const signature = crypto.createHmac('sha256', JWT_SECRET).update(payload).digest('hex');
  const token = Buffer.from(JSON.stringify({ payload, signature })).toString('base64');
  return { token, expiry };
}

function verifyToken(key: string, deviceId: string, tokenStr: string): boolean {
  try {
    const decoded = JSON.parse(Buffer.from(tokenStr, 'base64').toString('utf8'));
    const [tKey, tDev, tExp] = decoded.payload.split(':');
    if (tKey !== key || tDev !== deviceId || Number(tExp) < Date.now()) {
      return false;
    }
    const expectedSig = crypto.createHmac('sha256', JWT_SECRET).update(decoded.payload).digest('hex');
    return expectedSig === decoded.signature;
  } catch (e) {
    return false;
  }
}

export const apiRouter = express.Router();

// Middleware to ensure res.status, res.json and res.send always exist on raw Connect responses
apiRouter.use((req: any, res: any, next: any) => {
  if (typeof res.status !== 'function') {
    res.status = function (code: number) {
      res.statusCode = code;
      return res;
    };
  }
  if (typeof res.json !== 'function') {
    res.json = function (data: any) {
      if (!res.headersSent) {
        res.setHeader('Content-Type', 'application/json');
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

// JSON body parser for Connect / raw Node HTTP pipelines
apiRouter.use((req: any, res: any, next: any) => {
  if (req.body !== undefined) return next();
  if (req.method === 'GET' || req.method === 'HEAD') {
    req.body = {};
    return next();
  }
  let bodyData = '';
  req.on('data', (chunk: any) => { bodyData += chunk; });
  req.on('end', () => {
    if (bodyData) {
      try {
        req.body = JSON.parse(bodyData);
      } catch {
        req.body = {};
      }
    } else {
      req.body = {};
    }
    next();
  });
});

// Client Endpoints
apiRouter.post('/api/client/save', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'Database not initialized' });
    const { id, name, email, phone } = req.body;
    if (!name || !email) return res.status(400).json({ success: false, error: 'Nome e e-mail são obrigatórios.' });

    const now = new Date().toISOString();
    if (id) {
      await db.collection('clients').doc(id).set({
        name,
        email,
        phone: phone || '',
        updatedAt: now
      }, { merge: true });
      await db.collection('audit_logs').add({
        action: 'API_UPDATE_CLIENT',
        adminEmail: 'admin@system',
        details: `Cliente ${name} (${id}) atualizado com sucesso`,
        createdAt: now
      });
      return res.json({ success: true, message: 'Cliente atualizado com sucesso', id });
    } else {
      const docRef = await db.collection('clients').add({
        name,
        email,
        phone: phone || '',
        createdAt: now
      });
      await db.collection('audit_logs').add({
        action: 'API_CREATE_CLIENT',
        adminEmail: 'admin@system',
        details: `Cliente ${name} cadastrado com sucesso`,
        createdAt: now
      });
      return res.json({ success: true, message: 'Cliente cadastrado com sucesso', id: docRef.id });
    }
  } catch (error: any) {
    console.error('Save client error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/client/delete', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { client_id, id } = req.body || {};
    const targetId = client_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID do cliente obrigatório' });
    
    if (db) {
      try {
        await db.collection('clients').doc(targetId).delete();
        await db.collection('audit_logs').add({
          action: 'API_DELETE_CLIENT',
          adminEmail: 'admin@system',
          details: `Cliente ${targetId} excluído com sucesso`,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr: any) {
        console.warn('Backend Firestore delete notice (handled by client SDK):', dbErr?.message || dbErr);
      }
    }
    return res.json({ success: true, message: 'Cliente excluído com sucesso' });
  } catch (error: any) {
    console.error('Delete client error:', error);
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/sale/delete', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { sale_id, id } = req.body || {};
    const targetId = sale_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID da venda obrigatório' });
    
    if (db) {
      try {
        await db.collection('sales').doc(targetId).delete();
        await db.collection('audit_logs').add({
          action: 'API_DELETE_SALE',
          adminEmail: 'admin@system',
          details: `Venda ${targetId} excluída`,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr: any) {
        console.warn('Backend sale delete notice:', dbErr?.message || dbErr);
      }
    }
    return res.json({ success: true, message: 'Venda excluída com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/license/delete', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { license_id, id } = req.body || {};
    const targetId = license_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID da licença obrigatório' });
    
    if (db) {
      try {
        await db.collection('licenses').doc(targetId).delete();
        await db.collection('audit_logs').add({
          action: 'API_DELETE_LICENSE',
          adminEmail: 'admin@system',
          details: `Licença ${targetId} excluída`,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr: any) {
        console.warn('Backend license delete notice:', dbErr?.message || dbErr);
      }
    }
    return res.json({ success: true, message: 'Licença excluída com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

apiRouter.post('/api/trial/delete', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    const { trial_id, id } = req.body || {};
    const targetId = trial_id || id;
    if (!targetId) return res.status(400).json({ success: false, error: 'ID do teste obrigatório' });
    
    if (db) {
      try {
        await db.collection('trials').doc(targetId).delete();
        await db.collection('audit_logs').add({
          action: 'API_DELETE_TRIAL',
          adminEmail: 'admin@system',
          details: `Teste ${targetId} excluído`,
          createdAt: new Date().toISOString()
        });
      } catch (dbErr: any) {
        console.warn('Backend trial delete notice:', dbErr?.message || dbErr);
      }
    }
    return res.json({ success: true, message: 'Teste excluído com sucesso' });
  } catch (error: any) {
    return res.status(500).json({ success: false, error: error.message });
  }
});

// 1. Activate License
apiRouter.post('/api/license/activate', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'Database not initialized' });

    const { key, license_key, device_id, device_info, app_version } = req.body;
    const licenseKey = key || license_key;
    const deviceId = device_id;

    if (!licenseKey || !deviceId) {
      return res.status(400).json({ success: false, error: 'Chave de licença e ID do dispositivo são obrigatórios.' });
    }

    const licensesRef = db.collection('licenses');
    const snapshot = await licensesRef.where('key', '==', licenseKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, error: 'Chave de licença não encontrada.' });
    }

    const licenseDoc = snapshot.docs[0];
    const licenseData = licenseDoc.data();

    const saleDoc = await db.collection('sales').doc(licenseData.saleId).get();
    if (!saleDoc.exists || saleDoc.data()?.status !== 'pago') {
      return res.status(400).json({ 
        success: false, 
        error: 'Licença pendente de confirmação de pagamento. Nenhum acesso autorizado até a confirmação do Pix.' 
      });
    }

    if (licenseData.status === 'bloqueada' || licenseData.status === 'revogada') {
      return res.status(403).json({ success: false, error: 'Esta licença foi bloqueada ou revogada pela administração.', state: 'LICENSE_BLOCKED' });
    }

    if (licenseData.deviceId && licenseData.deviceId !== deviceId) {
      return res.status(409).json({ 
        success: false, 
        error: 'Esta licença já está vinculada a outro dispositivo Android. Cada licença é exclusiva para 1 instalação.',
        state: 'LICENSE_BLOCKED'
      });
    }

    const now = new Date().toISOString();
    await licenseDoc.ref.update({
      deviceId: deviceId,
      deviceInfo: device_info || 'Dispositivo Android',
      status: 'ativa',
      activatedAt: licenseData.activatedAt || now,
      lastValidatedAt: now
    });

    const { token, expiry } = generateToken(licenseKey, deviceId);

    await db.collection('audit_logs').add({
      action: 'API_ACTIVATE_LICENSE',
      adminEmail: 'api-android@system',
      details: `Ativação da chave ${licenseKey} no dispositivo ${deviceId}`,
      createdAt: now
    });

    return res.json({
      success: true,
      state: 'LICENSE_ACTIVE',
      message: 'WhatsTransmição PRO ativado com sucesso!',
      product: 'WhatsTransmição PRO',
      client_name: licenseData.clientName,
      token,
      expiry,
      device_id: deviceId
    });

  } catch (error: any) {
    console.error('Activate error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao processar ativação.' });
  }
});

// 2. Validate License
apiRouter.post('/api/license/validate', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Database not initialized' });

    const { key, license_key, device_id, token } = req.body;
    const licenseKey = key || license_key;
    const deviceId = device_id;

    if (!licenseKey || !deviceId) {
      return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Chave e dispositivo obrigatórios.' });
    }

    const licensesRef = db.collection('licenses');
    const snapshot = await licensesRef.where('key', '==', licenseKey).limit(1).get();

    if (snapshot.empty) {
      return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Licença não encontrada.' });
    }

    const licenseDoc = snapshot.docs[0];
    const licenseData = licenseDoc.data();

    if (licenseData.status === 'bloqueada' || licenseData.status === 'revogada') {
      return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Licença bloqueada ou revogada.' });
    }

    if (licenseData.deviceId !== deviceId) {
      return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Dispositivo não autorizado para esta chave.' });
    }

    if (token && !verifyToken(licenseKey, deviceId, token)) {
      return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Token inválido ou expirado.' });
    }

    await licenseDoc.ref.update({ lastValidatedAt: new Date().toISOString() });

    return res.json({
      valid: true,
      state: 'LICENSE_ACTIVE',
      status: 'ativa',
      client_name: licenseData.clientName,
      product: 'WhatsTransmição PRO'
    });

  } catch (error: any) {
    console.error('Validate error:', error);
    return res.json({ valid: false, state: 'LICENSE_BLOCKED', error: 'Erro interno na validação.' });
  }
});

// 3. Deactivate License
apiRouter.post('/api/license/deactivate', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'Database not initialized' });

    const { key, license_key, device_id } = req.body;
    const licenseKey = key || license_key;

    if (!licenseKey) {
      return res.status(400).json({ success: false, error: 'Chave obrigatória.' });
    }

    const licensesRef = db.collection('licenses');
    const snapshot = await licensesRef.where('key', '==', licenseKey).limit(1).get();

    if (snapshot.empty) {
      return res.status(404).json({ success: false, error: 'Licença não encontrada.' });
    }

    const licenseDoc = snapshot.docs[0];
    await licenseDoc.ref.update({
      deviceId: null,
      deviceInfo: null,
      status: 'inativa',
      lastValidatedAt: new Date().toISOString()
    });

    return res.json({ success: true, message: 'Licença desvinculada do dispositivo com sucesso.' });
  } catch (error: any) {
    console.error('Deactivate error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno.' });
  }
});

// 4. Create Pix (Using Pedro Igor's fixed Pix and QR code image)
apiRouter.post('/api/payment/create-pix', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'Database not initialized' });

    const { sale_id, amount, customer_name, customer_email, customer_phone } = req.body;
    if (!sale_id) {
      return res.status(400).json({ success: false, error: 'ID da venda é obrigatório.' });
    }

    const saleRef = db.collection('sales').doc(sale_id);
    const saleDoc = await saleRef.get();
    if (!saleDoc.exists) {
      return res.status(404).json({ success: false, error: 'Venda não encontrada.' });
    }

    await saleRef.update({ 
      pixCode: FIXED_PIX_CODE,
      amount: 239.90
    });

    return res.json({
      success: true,
      provider: 'Pix Oficial (Pedro Igor Alves da Silva - R$ 239,90)',
      order_id: `PIX-VITALICIO-${sale_id.substring(0, 8)}`,
      pix_code: FIXED_PIX_CODE,
      qr_code_image: FIXED_QR_CODE_IMAGE,
      message: 'Pix gerado com sucesso.'
    });

  } catch (error: any) {
    console.error('Pix error:', error);
    return res.status(500).json({ success: false, error: 'Erro ao gerar Pix.' });
  }
});

// 5. PagSeguro Webhook
apiRouter.post('/api/webhook/pagseguro', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).send('DB error');

    const notification = req.body;
    const referenceId = notification.reference_id || notification.charges?.[0]?.reference_id;
    const status = notification.status || notification.charges?.[0]?.status;

    if (referenceId && (status === 'PAID' || status === 'AUTHORIZED' || status === 'pago')) {
      const saleRef = db.collection('sales').doc(referenceId);
      const saleDoc = await saleRef.get();

      if (saleDoc.exists && saleDoc.data()?.status !== 'pago') {
        const saleData = saleDoc.data()!;
        const now = new Date().toISOString();

        await saleRef.update({ status: 'pago', paidAt: now });

        const existingLic = await db.collection('licenses').where('saleId', '==', referenceId).limit(1).get();
        if (existingLic.empty) {
          const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
          const licenseKey = `WST-PRO-${randomPart()}-${randomPart()}-${randomPart()}`;

          await db.collection('licenses').add({
            key: licenseKey,
            clientId: saleData.clientId,
            clientName: saleData.clientName,
            saleId: referenceId,
            status: 'inativa',
            deviceId: null,
            deviceInfo: null,
            activatedAt: null,
            lastValidatedAt: null,
            createdAt: now
          });

          await db.collection('audit_logs').add({
            action: 'WEBHOOK_PIX_PAID',
            adminEmail: 'pix-webhook@system',
            details: `Pagamento Pix confirmado para venda ${referenceId}. Chave gerada.`,
            createdAt: now
          });
        }
      }
    }

    return res.status(200).send('OK');
  } catch (error: any) {
    console.error('Webhook error:', error);
    return res.status(500).send('Webhook Error');
  }
});

// 6. Trial Start
apiRouter.post('/api/trial/start', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.status(500).json({ success: false, error: 'Database not initialized' });

    const { device_id, installation_uuid, device_info } = req.body;
    const devId = device_id || installation_uuid;

    if (!devId) {
      return res.status(400).json({ success: false, error: 'Identificador do dispositivo é obrigatório.' });
    }

    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown';
    const ipHash = crypto.createHash('sha256').update(String(clientIp)).digest('hex');
    const trialsRef = db.collection('trials');

    const result = await db.runTransaction(async (transaction: any) => {
      const q = trialsRef.where('deviceId', '==', devId).limit(1);
      const snapshot = await transaction.get(q);

      const now = new Date();
      const nowIso = now.toISOString();

      if (!snapshot.empty) {
        const trialDoc = snapshot.docs[0];
        const data = trialDoc.data();
        const expiresAt = new Date(data.trialExpiresAt);
        const isExpired = now >= expiresAt;
        const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
        const currentState = isExpired ? 'TRIAL_EXPIRED' : 'TRIAL_ACTIVE';

        if (data.status !== currentState) {
          transaction.update(trialDoc.ref, { status: currentState, lastCheckedAt: nowIso });
        }

        return {
          success: true,
          state: currentState,
          trial_started_at: data.trialStartedAt,
          trial_expires_at: data.trialExpiresAt,
          remaining_seconds: remainingSeconds,
          message: isExpired ? 'O período de teste gratuito expirou.' : 'Teste gratuito em andamento.'
        };
      } else {
        const expiresAt = new Date(now.getTime() + 120 * 60 * 1000);
        const newTrialRef = trialsRef.doc();
        const trialData = {
          id: newTrialRef.id,
          deviceId: devId,
          installationUuid: installation_uuid || devId,
          ipHash,
          status: 'TRIAL_ACTIVE',
          trialStartedAt: nowIso,
          trialExpiresAt: expiresAt.toISOString(),
          lastCheckedAt: nowIso,
          deviceInfo: device_info || 'Dispositivo Android'
        };

        transaction.set(newTrialRef, trialData);

        return {
          success: true,
          state: 'TRIAL_ACTIVE',
          trial_started_at: nowIso,
          trial_expires_at: expiresAt.toISOString(),
          remaining_seconds: 120 * 60,
          message: 'Teste gratuito de 2 horas iniciado com sucesso!'
        };
      }
    });

    return res.json(result);

  } catch (error: any) {
    console.error('Trial start error:', error);
    return res.status(500).json({ success: false, error: 'Erro interno ao iniciar teste gratuito.' });
  }
});

// 7. Trial Status
apiRouter.post('/api/trial/status', async (req: Request, res: Response) => {
  try {
    const db = getDb();
    if (!db) return res.json({ state: 'TRIAL_EXPIRED', error: 'Database not initialized' });

    const { device_id, installation_uuid, license_key } = req.body;
    const devId = device_id || installation_uuid;

    if (!devId && !license_key) {
      return res.json({ state: 'TRIAL_EXPIRED', error: 'Identificador obrigatório.' });
    }

    if (license_key) {
      const licSnap = await db.collection('licenses').where('key', '==', license_key).limit(1).get();
      if (!licSnap.empty) {
        const lic = licSnap.docs[0].data();
        if (lic.status === 'ativa' && lic.deviceId === devId) {
          return res.json({ state: 'LICENSE_ACTIVE', message: 'Licença paga ativa.', client_name: lic.clientName });
        }
      }
    }

    if (devId) {
      const licSnap = await db.collection('licenses').where('deviceId', '==', devId).where('status', '==', 'ativa').limit(1).get();
      if (!licSnap.empty) {
        const lic = licSnap.docs[0].data();
        return res.json({ state: 'LICENSE_ACTIVE', message: 'Licença paga ativa.', client_name: lic.clientName });
      }
    }

    if (!devId) {
      return res.json({ state: 'TRIAL_EXPIRED', message: 'Nenhum dispositivo identificado.' });
    }

    const trialsSnap = await db.collection('trials').where('deviceId', '==', devId).limit(1).get();

    if (trialsSnap.empty) {
      return res.json({
        state: 'TRIAL_EXPIRED',
        trial_started_at: null,
        trial_expires_at: null,
        remaining_seconds: 0,
        message: 'Nenhum teste gratuito encontrado.',
        purchase_url: 'https://wa.me/5566999775501?text=Olá,%20desejo%20adquirir%20a%20licença%20vitalícia%20do%20WhatsTransmição%20PRO%20por%20R$%20239,90'
      });
    }

    const trialDoc = trialsSnap.docs[0];
    const data = trialDoc.data();

    const now = new Date();
    const expiresAt = new Date(data.trialExpiresAt);
    const isExpired = now >= expiresAt;
    const remainingSeconds = Math.max(0, Math.floor((expiresAt.getTime() - now.getTime()) / 1000));
    const currentState = isExpired ? 'TRIAL_EXPIRED' : 'TRIAL_ACTIVE';

    if (data.status !== currentState) {
      await trialDoc.ref.update({ status: currentState, lastCheckedAt: now.toISOString() });
    }

    return res.json({
      state: currentState,
      trial_started_at: data.trialStartedAt,
      trial_expires_at: data.trialExpiresAt,
      remaining_seconds: remainingSeconds,
      message: isExpired ? 'O período de teste gratuito de 2 horas expirou.' : `Teste ativo. Restam ${Math.floor(remainingSeconds / 60)} minutos.`,
      purchase_url: 'https://wa.me/5566999775501?text=Olá,%20desejo%20adquirir%20a%20licença%20vitalícia%20do%20WhatsTransmição%20PRO%20por%20R$%20239,90'
    });

  } catch (error: any) {
    console.error('Trial status error:', error);
    return res.json({ state: 'TRIAL_EXPIRED', error: 'Erro interno na verificação do teste.' });
  }
});
