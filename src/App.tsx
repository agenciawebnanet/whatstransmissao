import React, { useState, useEffect } from 'react';
import { 
  Shield, Key, Users, ShoppingCart, Activity, FileText, Plus, Search, 
  Trash2, Edit, CheckCircle, XCircle, AlertTriangle, RefreshCw, LogOut, 
  Lock, Unlock, Smartphone, ExternalLink, Copy, Check, Terminal, Clock, DollarSign, QrCode, X, AlertCircle, Menu
} from 'lucide-react';
import { 
  collection, getDocs, addDoc, updateDoc, deleteDoc, doc, query, orderBy, serverTimestamp, setDoc 
} from 'firebase/firestore';
import { signInWithPopup, GoogleAuthProvider, signOut, onAuthStateChanged } from 'firebase/auth';
import { db, auth } from './firebase';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  createdAt: string;
}

interface Sale {
  id: string;
  clientId: string;
  clientName: string;
  product: string;
  amount: number;
  status: 'pendente' | 'pago' | 'cancelado' | 'reembolsado';
  paymentMethod: string;
  pixCode?: string;
  pagseguroOrderId?: string;
  createdAt: string;
  paidAt?: string | null;
}

interface License {
  id: string;
  key: string;
  clientId: string;
  clientName: string;
  saleId: string;
  status: 'inativa' | 'ativa' | 'bloqueada' | 'revogada';
  deviceId?: string | null;
  deviceInfo?: string | null;
  activatedAt?: string | null;
  lastValidatedAt?: string | null;
  createdAt: string;
}

interface Trial {
  id: string;
  deviceId: string;
  installationUuid: string;
  ipHash?: string;
  status: 'TRIAL_ACTIVE' | 'TRIAL_EXPIRED' | 'CONVERTED_TO_LICENSE';
  trialStartedAt: string;
  trialExpiresAt: string;
  lastCheckedAt: string;
  deviceInfo?: string;
}

interface AuditLog {
  id: string;
  action: string;
  adminEmail: string;
  details: string;
  createdAt: string;
}

interface ConfirmDialogState {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  confirmVariant?: 'danger' | 'primary' | 'warning';
  onConfirm: () => Promise<void> | void;
}

interface ToastState {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

const FIXED_PIX_CODE = '00020126720014BR.GOV.BCB.PIX013639fe1e46-001d-499e-8bbd-4bd9a0746e6d0210Vitalicio 5204000053039865406239.905802BR5925PEDRO IGOR ALVES DA SILVA6009SAO PAULO622605224XFv7wymjQUh3OViUZlCx56304A298';
const FIXED_QR_CODE_IMAGE = 'https://i.ibb.co/HfyQkFbT/image.png';

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [loadingAuth, setLoadingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'clients' | 'sales' | 'licenses' | 'trials' | 'api_docs' | 'audit'>('dashboard');
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const [clients, setClients] = useState<Client[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [licenses, setLicenses] = useState<License[]>([]);
  const [trials, setTrials] = useState<Trial[]>([]);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingData, setLoadingData] = useState(false);

  const [searchTerm, setSearchTerm] = useState('');

  // Modals state
  const [showClientModal, setShowClientModal] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [clientForm, setClientForm] = useState({ name: '', phone: '', email: '' });

  const [showSaleModal, setShowSaleModal] = useState(false);
  const [saleForm, setSaleForm] = useState({ clientId: '', amount: 239.90, paymentMethod: 'Pix Oficial' });

  const [pixModalData, setPixModalData] = useState<{ pixCode: string; orderId: string; clientName: string; qrImage: string } | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // In-App Toast & Confirmation states (replaces window.alert and window.confirm)
  const [toast, setToast] = useState<ToastState | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<ConfirmDialogState>({
    isOpen: false,
    title: '',
    message: '',
    onConfirm: () => {}
  });
  const [isProcessingAction, setIsProcessingAction] = useState(false);

  const showToast = (message: string, type: 'success' | 'error' | 'info' = 'success') => {
    const id = Date.now();
    setToast({ id, message, type });
    setTimeout(() => {
      setToast(curr => (curr?.id === id ? null : curr));
    }, 4000);
  };

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setLoadingAuth(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (user) {
      fetchAllData();
    }
  }, [user]);

  const fetchAllData = async () => {
    setLoadingData(true);
    try {
      const clientsSnap = await getDocs(collection(db, 'clients')).catch(err => {
        console.error('Clients fetch error:', err);
        return { docs: [] } as any;
      });
      setClients(clientsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Client[]);

      const salesSnap = await getDocs(collection(db, 'sales')).catch(err => {
        console.error('Sales fetch error:', err);
        return { docs: [] } as any;
      });
      setSales(salesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Sale[]);

      const licensesSnap = await getDocs(collection(db, 'licenses')).catch(err => {
        console.error('Licenses fetch error:', err);
        return { docs: [] } as any;
      });
      setLicenses(licensesSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as License[]);

      const trialsSnap = await getDocs(collection(db, 'trials')).catch(err => {
        console.error('Trials fetch error:', err);
        return { docs: [] } as any;
      });
      setTrials(trialsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as Trial[]);

      const logsSnap = await getDocs(collection(db, 'audit_logs')).catch(err => {
        console.error('Logs fetch error:', err);
        return { docs: [] } as any;
      });
      setAuditLogs(logsSnap.docs.map((d: any) => ({ id: d.id, ...d.data() })) as AuditLog[]);

    } catch (e) {
      console.error('Fetch error:', e);
    } finally {
      setLoadingData(false);
    }
  };

  const logAction = async (action: string, details: string) => {
    try {
      await addDoc(collection(db, 'audit_logs'), {
        action,
        adminEmail: user?.email || 'admin@system',
        details,
        createdAt: new Date().toISOString()
      });
    } catch (e) {
      console.error('Audit log error:', e);
    }
  };

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      await signInWithPopup(auth, provider);
      showToast('Login realizado com sucesso!', 'success');
    } catch (e: any) {
      console.error('Firebase Login Error:', e);
      if (e?.code === 'auth/unauthorized-domain') {
        showToast(`Domínio não autorizado no Firebase! Adicione "${window.location.hostname}" em Firebase Console > Authentication > Settings > Authorized domains.`, 'error');
      } else if (e?.code === 'auth/popup-blocked') {
        showToast('O navegador bloqueou a janela pop-up do Google. Permita pop-ups para fazer login.', 'error');
      } else if (e?.code === 'auth/popup-closed-by-user') {
        showToast('Janela de login fechada antes da conclusão.', 'info');
      } else {
        showToast('Erro ao fazer login: ' + (e?.message || e), 'error');
      }
    }
  };

  const handleLogout = async () => {
    await signOut(auth);
  };

  const getAdminAuthHeaders = async () => {
    const token = await auth.currentUser?.getIdToken();
    return {
      'Content-Type': 'application/json',
      ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
  };

  // CLIENT ACTIONS
  const handleOpenNewClientModal = () => {
    setEditingClient(null);
    setClientForm({ name: '', phone: '', email: '' });
    setShowClientModal(true);
  };

  const handleOpenEditClientModal = (client: Client) => {
    setEditingClient(client);
    setClientForm({ name: client.name, phone: client.phone, email: client.email });
    setShowClientModal(true);
  };

  const handleSaveClient = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientForm.name.trim() || !clientForm.email.trim()) {
      showToast('Nome e e-mail são obrigatórios.', 'error');
      return;
    }

    try {
      if (editingClient) {
        // Direct Firestore update
        await updateDoc(doc(db, 'clients', editingClient.id), {
          name: clientForm.name.trim(),
          phone: clientForm.phone.trim(),
          email: clientForm.email.trim(),
          updatedAt: new Date().toISOString()
        }).catch(err => console.warn('Firestore updateDoc warning:', err));

        // Fallback server API update
        const headers = await getAdminAuthHeaders();
        await fetch('/api/client/save', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            id: editingClient.id,
            name: clientForm.name.trim(),
            phone: clientForm.phone.trim(),
            email: clientForm.email.trim()
          })
        }).catch(err => console.warn('Server client save warning:', err));

        await logAction('UPDATE_CLIENT', `Cliente atualizado: ${clientForm.name.trim()}`);
        showToast('Cliente atualizado com sucesso!', 'success');
      } else {
        // Direct Firestore create
        await addDoc(collection(db, 'clients'), {
          name: clientForm.name.trim(),
          phone: clientForm.phone.trim(),
          email: clientForm.email.trim(),
          createdAt: new Date().toISOString()
        }).catch(async (err) => {
          console.warn('Firestore addDoc fallback:', err);
          const headers = await getAdminAuthHeaders();
          await fetch('/api/client/save', {
            method: 'POST',
            headers,
            body: JSON.stringify({
              name: clientForm.name.trim(),
              phone: clientForm.phone.trim(),
              email: clientForm.email.trim()
            })
          });
        });

        await logAction('CREATE_CLIENT', `Cliente cadastrado: ${clientForm.name.trim()}`);
        showToast('Cliente cadastrado com sucesso!', 'success');
      }

      setShowClientModal(false);
      setEditingClient(null);
      setClientForm({ name: '', phone: '', email: '' });
      fetchAllData();
    } catch (err: any) {
      console.error('Save client error:', err);
      showToast('Erro ao salvar cliente: ' + (err.message || err), 'error');
    }
  };

  // Safe delete with custom modal
  const promptDeleteClient = (client: Client) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Cliente',
      message: `Tem certeza que deseja excluir o cliente "${client.name}" (${client.email})? Esta ação é definitiva e removerá o cadastro do sistema.`,
      confirmLabel: 'Excluir Cliente',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsProcessingAction(true);
        // Optimistic UI update
        setClients(prev => prev.filter(c => c.id !== client.id));

        try {
          // 1. Delete via Firestore SDK
          await deleteDoc(doc(db, 'clients', client.id)).catch(err => {
            console.warn('Firestore deleteDoc notice:', err);
          });

          // 2. Delete via backend server API with Admin Bearer Token
          const headers = await getAdminAuthHeaders();
          await fetch('/api/client/delete', {
            method: 'POST',
            headers,
            body: JSON.stringify({ client_id: client.id })
          }).catch(err => {
            console.warn('Server delete client notice:', err);
          });

          await logAction('DELETE_CLIENT', `Cliente excluído: ${client.name} (${client.id})`);
          showToast(`Cliente "${client.name}" excluído com sucesso!`, 'success');
        } catch (err: any) {
          console.error('Delete client error:', err);
          showToast('Erro ao excluir cliente: ' + (err.message || err), 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };

  // SALES ACTIONS
  const handleCreateSale = async (e: React.FormEvent) => {
    e.preventDefault();
    const client = clients.find(c => c.id === saleForm.clientId);
    if (!client) {
      showToast('Por favor, selecione um cliente válido.', 'error');
      return;
    }

    try {
      const saleData = {
        clientId: client.id,
        clientName: client.name,
        product: 'WhatsTransmição PRO - Vitalício',
        amount: Number(saleForm.amount),
        status: 'pendente',
        paymentMethod: saleForm.paymentMethod,
        pixCode: FIXED_PIX_CODE,
        createdAt: new Date().toISOString(),
        paidAt: null
      };
      const docRef = await addDoc(collection(db, 'sales'), saleData);
      
      setPixModalData({
        pixCode: FIXED_PIX_CODE,
        orderId: `PIX-VITALICIO-${docRef.id.substring(0, 8)}`,
        clientName: client.name,
        qrImage: FIXED_QR_CODE_IMAGE
      });

      await logAction('CREATE_SALE_PIX', `Venda Pix criada para ${client.name} - R$ ${saleForm.amount}`);
      setShowSaleModal(false);
      setSaleForm({ clientId: '', amount: 239.90, paymentMethod: 'Pix Oficial' });
      showToast('Venda Pix gerada com sucesso!', 'success');
      fetchAllData();
    } catch (err: any) {
      showToast('Erro ao criar venda com Pix: ' + err.message, 'error');
    }
  };

  const handleShowPix = (sale: Sale) => {
    setPixModalData({
      pixCode: sale.pixCode || FIXED_PIX_CODE,
      orderId: `PIX-VITALICIO-${sale.id.substring(0, 8)}`,
      clientName: sale.clientName,
      qrImage: FIXED_QR_CODE_IMAGE
    });
  };

  const handleUpdateSaleStatus = async (saleId: string, newStatus: 'pendente' | 'pago' | 'cancelado' | 'reembolsado') => {
    try {
      const updateData: any = { status: newStatus };
      if (newStatus === 'pago') {
        updateData.paidAt = new Date().toISOString();
      }
      await updateDoc(doc(db, 'sales', saleId), updateData).catch(() => {});
      await logAction('UPDATE_SALE_STATUS', `Venda ${saleId} atualizada para: ${newStatus}`);

      if (newStatus === 'pago') {
        // Also call backend API to sync order and create license with Admin Bearer Token
        const headers = await getAdminAuthHeaders();
        await fetch('/api/order/confirm-manual', {
          method: 'POST',
          headers,
          body: JSON.stringify({ order_id: saleId })
        }).catch(err => console.warn('Order confirm API notice:', err));

        const sale = sales.find(s => s.id === saleId);
        if (sale) {
          const existingLic = licenses.find(l => l.saleId === saleId);
          if (!existingLic) {
            const randomPart = () => Math.random().toString(36).substring(2, 6).toUpperCase();
            const licenseKey = `WST-PRO-${randomPart()}-${randomPart()}-${randomPart()}`;
            await addDoc(collection(db, 'licenses'), {
              key: licenseKey,
              clientId: sale.clientId,
              clientName: sale.clientName,
              saleId: sale.id,
              status: 'inativa',
              deviceId: null,
              deviceInfo: null,
              activatedAt: null,
              lastValidatedAt: null,
              createdAt: new Date().toISOString()
            }).catch(() => {});
            await logAction('AUTO_GENERATE_LICENSE', `Chave ${licenseKey} gerada automaticamente para ${sale.clientName} após confirmação Pix.`);
            showToast(`Venda aprovada! Chave ${licenseKey} gerada com sucesso.`, 'success');
          } else {
            showToast('Venda atualizada para paga e licença confirmada!', 'success');
          }
        }
      } else {
        showToast(`Status da venda atualizado para ${newStatus}.`, 'info');
      }

      fetchAllData();
    } catch (err: any) {
      console.error('Update sale error:', err);
      showToast('Erro ao atualizar venda: ' + (err.message || err), 'error');
    }
  };

  const promptDeleteSale = (sale: Sale) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Venda',
      message: `Deseja realmente excluir o registro da venda para "${sale.clientName}" no valor de R$ ${sale.amount.toFixed(2)}?`,
      confirmLabel: 'Excluir Venda',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsProcessingAction(true);
        setSales(prev => prev.filter(s => s.id !== sale.id));
        try {
          await deleteDoc(doc(db, 'sales', sale.id)).catch(e => console.warn(e));
          const headers = await getAdminAuthHeaders();
          await fetch('/api/sale/delete', {
            method: 'POST',
            headers,
            body: JSON.stringify({ sale_id: sale.id })
          }).catch(e => console.warn(e));

          await logAction('DELETE_SALE', `Venda ${sale.id} excluída`);
          showToast('Venda excluída com sucesso!', 'success');
        } catch (err: any) {
          showToast('Erro ao excluir venda: ' + err.message, 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };

  // LICENSE ACTIONS
  const handleUpdateLicenseStatus = async (licenseId: string, status: 'inativa' | 'ativa' | 'bloqueada' | 'revogada') => {
    try {
      await updateDoc(doc(db, 'licenses', licenseId), { status });
      await logAction('UPDATE_LICENSE', `Licença ${licenseId} alterada para status: ${status}`);
      showToast(`Licença alterada para ${status}.`, 'info');
      fetchAllData();
    } catch (err: any) {
      showToast('Erro ao atualizar licença: ' + err.message, 'error');
    }
  };

  const promptResetDevice = (license: License) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Desvincular Dispositivo',
      message: `Deseja liberar a chave "${license.key}" para que o cliente possa instalá-la em um novo aparelho Android?`,
      confirmLabel: 'Desvincular Dispositivo',
      confirmVariant: 'warning',
      onConfirm: async () => {
        setIsProcessingAction(true);
        try {
          await updateDoc(doc(db, 'licenses', license.id), {
            deviceId: null,
            deviceInfo: null,
            status: 'inativa'
          });

          const headers = await getAdminAuthHeaders();
          await fetch('/api/license/deactivate', {
            method: 'POST',
            headers,
            body: JSON.stringify({ key: license.key })
          }).catch(e => console.warn(e));

          await logAction('RESET_DEVICE', `Dispositivo resetado para a licença ${license.key}`);
          showToast('Dispositivo liberado com sucesso para nova instalação!', 'success');
        } catch (err: any) {
          showToast('Erro ao resetar dispositivo: ' + err.message, 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };

  const promptDeleteLicense = (license: License) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Licença',
      message: `Deseja realmente remover a chave de licença "${license.key}" do cliente ${license.clientName}?`,
      confirmLabel: 'Excluir Licença',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsProcessingAction(true);
        setLicenses(prev => prev.filter(l => l.id !== license.id));
        try {
          await deleteDoc(doc(db, 'licenses', license.id)).catch(e => console.warn(e));
          const headers = await getAdminAuthHeaders();
          await fetch('/api/license/delete', {
            method: 'POST',
            headers,
            body: JSON.stringify({ license_id: license.id })
          }).catch(e => console.warn(e));

          await logAction('DELETE_LICENSE', `Licença ${license.key} excluída`);
          showToast('Licença excluída com sucesso!', 'success');
        } catch (err: any) {
          showToast('Erro ao excluir licença: ' + err.message, 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };

  // TRIAL ACTIONS
  const promptExtendTrial = (trial: Trial) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Estender Teste Gratuito',
      message: `Deseja conceder mais 2 horas (120 minutos) de teste gratuito para o aparelho "${trial.deviceId}"?`,
      confirmLabel: 'Conceder +2 Horas',
      confirmVariant: 'primary',
      onConfirm: async () => {
        setIsProcessingAction(true);
        try {
          const currentExp = new Date(trial.trialExpiresAt);
          const now = new Date();
          const baseTime = currentExp > now ? currentExp : now;
          const newExpiresAt = new Date(baseTime.getTime() + 120 * 60 * 1000).toISOString();

          await updateDoc(doc(db, 'trials', trial.id), {
            trialExpiresAt: newExpiresAt,
            status: 'TRIAL_ACTIVE'
          });

          await logAction('EXTEND_TRIAL', `Teste gratuito ${trial.deviceId} estendido até ${newExpiresAt}`);
          showToast('Teste gratuito estendido em +120 minutos com sucesso!', 'success');
        } catch (err: any) {
          showToast('Erro ao estender teste: ' + err.message, 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };

  const promptDeleteTrial = (trial: Trial) => {
    setConfirmDialog({
      isOpen: true,
      title: 'Excluir Registro de Teste',
      message: `Deseja excluir o registro de teste do aparelho "${trial.deviceId}"? O aparelho poderá iniciar um novo teste após a exclusão.`,
      confirmLabel: 'Excluir Teste',
      confirmVariant: 'danger',
      onConfirm: async () => {
        setIsProcessingAction(true);
        setTrials(prev => prev.filter(t => t.id !== trial.id));
        try {
          await deleteDoc(doc(db, 'trials', trial.id)).catch(e => console.warn(e));
          const headers = await getAdminAuthHeaders();
          await fetch('/api/trial/delete', {
            method: 'POST',
            headers,
            body: JSON.stringify({ trial_id: trial.id })
          }).catch(e => console.warn(e));

          await logAction('DELETE_TRIAL', `Registro de teste ${trial.deviceId} excluído`);
          showToast('Registro de teste excluído com sucesso!', 'success');
        } catch (err: any) {
          showToast('Erro ao excluir teste: ' + err.message, 'error');
        } finally {
          setIsProcessingAction(false);
          setConfirmDialog(curr => ({ ...curr, isOpen: false }));
          fetchAllData();
        }
      }
    });
  };


  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(text);
    showToast('Copiado para a área de transferência!', 'info');
    setTimeout(() => setCopiedKey(null), 2000);
  };

  if (loadingAuth) {
    return (
      <div className="min-h-screen bg-zinc-950 text-emerald-400 flex items-center justify-center font-mono">
        <div className="flex items-center space-x-3">
          <RefreshCw className="animate-spin h-6 w-6 text-emerald-500" />
          <span>Carregando WhatsTransmição PRO...</span>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col items-center justify-center p-4">
        <div className="max-w-md w-full bg-zinc-900 border border-emerald-500/30 rounded-2xl p-8 shadow-2xl shadow-emerald-950/50 text-center">
          <div className="mx-auto bg-emerald-500/10 border border-emerald-500/30 w-16 h-16 rounded-2xl flex items-center justify-center mb-6 text-emerald-400">
            <Shield className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-white mb-2">WhatsTransmição PRO</h1>
          <p className="text-zinc-400 text-sm mb-8">Painel Administrativo & Pix (R$ 239,90)</p>
          <button
            onClick={handleLogin}
            className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-3 px-4 rounded-xl transition duration-200 flex items-center justify-center space-x-2 shadow-lg shadow-emerald-600/20 cursor-pointer"
          >
            <Shield className="h-5 w-5" />
            <span>Entrar com Google Admin</span>
          </button>
          <p className="text-xs text-zinc-500 mt-6">Acesso restrito a administradores autorizados.</p>
        </div>
      </div>
    );
  }

  const totalClients = clients.length;
  const totalSales = sales.length;
  const paidSales = sales.filter(s => s.status === 'pago');
  const grossRevenue = paidSales.reduce((acc, s) => acc + (s.amount || 239.90), 0);
  const activeLicenses = licenses.filter(l => l.status === 'ativa' && l.deviceId).length;
  const activeTrialsCount = trials.filter(t => t.status === 'TRIAL_ACTIVE' && new Date() < new Date(t.trialExpiresAt)).length;
  const blockedLicenses = licenses.filter(l => l.status === 'bloqueada' || l.status === 'revogada').length;

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col font-sans relative">
      {/* IN-APP TOAST NOTIFICATION */}
      {toast && (
        <div className="fixed top-5 right-5 z-[70] max-w-sm w-full animate-fade-in">
          <div className={`p-4 rounded-2xl border shadow-2xl flex items-start space-x-3 backdrop-blur-md ${
            toast.type === 'success' ? 'bg-zinc-900/95 border-emerald-500/40 text-emerald-400 shadow-emerald-950/40' :
            toast.type === 'error' ? 'bg-zinc-900/95 border-red-500/40 text-red-400 shadow-red-950/40' :
            'bg-zinc-900/95 border-blue-500/40 text-blue-400 shadow-blue-950/40'
          }`}>
            {toast.type === 'success' ? <CheckCircle className="h-5 w-5 shrink-0 mt-0.5" /> :
             toast.type === 'error' ? <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" /> :
             <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" />}
            <div className="flex-1 text-sm text-zinc-200">{toast.message}</div>
            <button 
              onClick={() => setToast(null)}
              className="text-zinc-500 hover:text-zinc-300 p-1 rounded-lg transition"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      {/* IN-APP CONFIRMATION MODAL */}
      {confirmDialog.isOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-[80]">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-5 shadow-2xl animate-scale-up">
            <div className="flex items-center space-x-3">
              <div className={`p-3 rounded-xl border ${
                confirmDialog.confirmVariant === 'danger' ? 'bg-red-500/10 text-red-400 border-red-500/30' :
                confirmDialog.confirmVariant === 'warning' ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' :
                'bg-emerald-500/10 text-emerald-400 border-emerald-500/30'
              }`}>
                {confirmDialog.confirmVariant === 'danger' ? <Trash2 className="h-6 w-6" /> :
                 confirmDialog.confirmVariant === 'warning' ? <AlertTriangle className="h-6 w-6" /> :
                 <CheckCircle className="h-6 w-6" />}
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">{confirmDialog.title}</h3>
                <p className="text-xs text-zinc-400">Confirmação de operação</p>
              </div>
            </div>

            <p className="text-sm text-zinc-300 leading-relaxed bg-zinc-950/50 p-3.5 rounded-xl border border-zinc-800/80">
              {confirmDialog.message}
            </p>

            <div className="flex justify-end space-x-3 pt-2">
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => setConfirmDialog(curr => ({ ...curr, isOpen: false }))}
                className="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm font-medium transition cursor-pointer disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={isProcessingAction}
                onClick={() => confirmDialog.onConfirm()}
                className={`px-4 py-2.5 rounded-xl text-sm font-semibold transition flex items-center space-x-2 shadow-lg cursor-pointer disabled:opacity-50 ${
                  confirmDialog.confirmVariant === 'danger'
                    ? 'bg-red-600 hover:bg-red-500 text-white shadow-red-950/50'
                    : confirmDialog.confirmVariant === 'warning'
                    ? 'bg-amber-600 hover:bg-amber-500 text-white shadow-amber-950/50'
                    : 'bg-emerald-600 hover:bg-emerald-500 text-white shadow-emerald-950/50'
                }`}
              >
                {isProcessingAction && <RefreshCw className="h-4 w-4 animate-spin" />}
                <span>{confirmDialog.confirmLabel || 'Confirmar'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Top Navbar */}
      <header className="bg-zinc-900/95 border-b border-zinc-800/80 sticky top-0 z-50 px-4 md:px-6 py-4 flex items-center justify-between backdrop-blur-xl">
        <div className="flex items-center space-x-3">
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 bg-zinc-800/80 hover:bg-zinc-700 text-zinc-300 rounded-xl transition"
            title="Menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="bg-emerald-500/10 border border-emerald-500/40 p-1.5 rounded-xl flex items-center justify-center shadow-lg shadow-emerald-950/40">
            <img 
              src="https://i.ibb.co/RprFscfL/cone-3-D-de-Seta-e-Sinal-Wi-Fi-Neon.png" 
              alt="WhatsTransmição PRO" 
              className="h-7 w-7 object-contain drop-shadow-[0_0_8px_rgba(16,185,129,0.8)]" 
            />
          </div>
          <div>
            <span className="text-base sm:text-lg font-bold tracking-tight text-white block">WhatsTransmição <span className="text-emerald-400">PRO</span></span>
            <span className="text-[11px] text-zinc-400 font-mono hidden sm:inline">Licença Vitalícia (R$ 239,90)</span>
          </div>
        </div>

        <div className="flex items-center space-x-3">
          <a
            href="https://wa.me/5566999775501?text=Olá,%20desejo%20adquirir%20a%20licença%20vitalícia%20do%20WhatsTransmição%20PRO%20por%20R$%20239,90"
            target="_blank"
            rel="noreferrer"
            className="bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 px-3 py-2 rounded-xl text-xs font-medium hidden xs:flex items-center space-x-2 transition"
          >
            <ExternalLink className="h-4 w-4" />
            <span className="hidden sm:inline">Suporte WhatsApp</span>
            <span className="sm:hidden">Suporte</span>
          </a>

          <div className="flex items-center space-x-3 pl-3 border-l border-zinc-800">
            <div className="text-right hidden md:block">
              <div className="text-xs font-medium text-white">{user.email}</div>
              <div className="text-[10px] text-emerald-400 font-mono">Administrador</div>
            </div>
            <button
              onClick={handleLogout}
              className="p-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 hover:text-white rounded-xl transition cursor-pointer"
              title="Sair"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Layout */}
      <div className="flex-1 flex flex-col md:flex-row relative">
        {/* Mobile Sidebar Overlay */}
        {mobileMenuOpen && (
          <div 
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-40 md:hidden animate-fade-in"
            onClick={() => setMobileMenuOpen(false)}
          />
        )}

        {/* Sidebar */}
        <aside className={`
          fixed md:static inset-y-0 left-0 z-50 w-72 md:w-64 bg-zinc-900/95 md:bg-zinc-900/50 border-r border-zinc-800 p-4 space-y-1 transform transition-transform duration-300 ease-in-out flex flex-col justify-between
          ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full md:translate-x-0'}
        `}>
          <div className="space-y-1">
            <div className="flex items-center justify-between pb-3 mb-2 md:hidden border-b border-zinc-800">
              <span className="text-sm font-bold text-white">Menu de Gerenciamento</span>
              <button 
                onClick={() => setMobileMenuOpen(false)}
                className="p-1.5 text-zinc-400 hover:text-white rounded-lg"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <button
              onClick={() => { setActiveTab('dashboard'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'dashboard' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <Activity className="h-4 w-4" />
              <span>Dashboard</span>
            </button>
            <button
              onClick={() => { setActiveTab('clients'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'clients' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <Users className="h-4 w-4" />
              <span>Clientes</span>
              {clients.length > 0 && (
                <span className="ml-auto text-xs px-2 py-0.5 rounded-full bg-zinc-800 text-zinc-300 font-mono">
                  {clients.length}
                </span>
              )}
            </button>
            <button
              onClick={() => { setActiveTab('sales'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'sales' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <ShoppingCart className="h-4 w-4" />
              <span>Vendas & Pix (R$ 239,90)</span>
            </button>
            <button
              onClick={() => { setActiveTab('licenses'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'licenses' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <Key className="h-4 w-4" />
              <span>Licenciamento</span>
            </button>
            <button
              onClick={() => { setActiveTab('trials'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'trials' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <Clock className="h-4 w-4" />
              <span>Testes Gratuitos (2h)</span>
            </button>
            <button
              onClick={() => { setActiveTab('api_docs'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'api_docs' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <Terminal className="h-4 w-4" />
              <span>API Android (Kotlin)</span>
            </button>
            <button
              onClick={() => { setActiveTab('audit'); setMobileMenuOpen(false); }}
              className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl text-sm font-medium transition cursor-pointer ${activeTab === 'audit' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 shadow-lg shadow-emerald-950/20' : 'text-zinc-400 hover:bg-zinc-800/50 hover:text-zinc-200'}`}
            >
              <FileText className="h-4 w-4" />
              <span>Logs de Auditoria</span>
            </button>
          </div>

          <div className="pt-6 mt-6 border-t border-zinc-800">
            <button
              onClick={() => {
                fetchAllData();
                showToast('Dados sincronizados com o servidor!', 'info');
              }}
              className="w-full flex items-center justify-center space-x-2 py-2 px-3 bg-zinc-800/60 hover:bg-zinc-800 text-zinc-300 rounded-xl text-xs transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingData ? 'animate-spin text-emerald-400' : ''}`} />
              <span>Sincronizar Dados</span>
            </button>
          </div>
        </aside>

        {/* Content Area */}
        <main className="flex-1 p-4 sm:p-6 md:p-8 overflow-y-auto">
          {loadingData && !clients.length && (
            <div className="flex items-center justify-center py-20 text-emerald-400 space-x-2 font-mono">
              <RefreshCw className="animate-spin h-5 w-5" />
              <span>Carregando dados...</span>
            </div>
          )}

          {/* TAB: DASHBOARD */}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Hero Banner with Gemini Generated Image */}
              <div className="relative rounded-2xl overflow-hidden border border-emerald-500/30 p-6 sm:p-8 bg-zinc-900 shadow-2xl">
                <div className="absolute inset-0 z-0 opacity-25 bg-cover bg-center" style={{ backgroundImage: `url('https://i.ibb.co/Ng0g4J33/Gemini-Generated-Image.jpg')` }} />
                <div className="absolute inset-0 bg-gradient-to-r from-zinc-950 via-zinc-900/90 to-transparent z-10" />
                <div className="relative z-20 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div>
                    <div className="inline-flex items-center space-x-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-mono mb-3 shadow-inner">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      <span>Sistema Ativo & Licenciamento 100% Online</span>
                    </div>
                    <h2 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">Painel <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-400 to-cyan-400">WhatsTransmição PRO</span></h2>
                    <p className="text-zinc-400 text-sm mt-1 max-w-xl">Gerenciamento completo de clientes, vendas Pix estático (R$ 239,90), ativações de licenças e testes gratuitos.</p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <a
                      href="https://wa.me/5566999775501?text=Olá,%20desejo%20adquirir%20a%20licença%20vitalícia%20do%20WhatsTransmição%20PRO"
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl font-medium text-sm transition shadow-lg shadow-emerald-950/50 flex items-center space-x-2"
                    >
                      <ExternalLink className="h-4 w-4" />
                      <span>Suporte WhatsApp</span>
                    </a>
                  </div>
                </div>
              </div>

              {/* Stat Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl relative overflow-hidden">
                  <div className="text-zinc-400 text-xs font-mono uppercase">Receita Bruta (Pix)</div>
                  <div className="text-2xl font-bold text-emerald-400 mt-2 font-mono">
                    R$ {grossRevenue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                  </div>
                  <div className="text-xs text-zinc-500 mt-1">{paidSales.length} compras aprovadas</div>
                  <DollarSign className="absolute right-4 bottom-4 h-8 w-8 text-emerald-500/10 pointer-events-none" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl relative overflow-hidden">
                  <div className="text-zinc-400 text-xs font-mono uppercase">Licenças Ativas</div>
                  <div className="text-2xl font-bold text-white mt-2 font-mono">{activeLicenses}</div>
                  <div className="text-xs text-zinc-500 mt-1">Vinculadas a dispositivos</div>
                  <Key className="absolute right-4 bottom-4 h-8 w-8 text-white/5 pointer-events-none" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl relative overflow-hidden">
                  <div className="text-zinc-400 text-xs font-mono uppercase">Testes Ativos (2h)</div>
                  <div className="text-2xl font-bold text-amber-400 mt-2 font-mono">{activeTrialsCount}</div>
                  <div className="text-xs text-zinc-500 mt-1">{trials.length} testes registrados</div>
                  <Clock className="absolute right-4 bottom-4 h-8 w-8 text-amber-500/10 pointer-events-none" />
                </div>

                <div className="bg-zinc-900 border border-zinc-800 p-5 rounded-2xl relative overflow-hidden">
                  <div className="text-zinc-400 text-xs font-mono uppercase">Total de Clientes</div>
                  <div className="text-2xl font-bold text-white mt-2 font-mono">{totalClients}</div>
                  <div className="text-xs text-zinc-500 mt-1">{blockedLicenses} licenças bloqueadas</div>
                  <Users className="absolute right-4 bottom-4 h-8 w-8 text-white/5 pointer-events-none" />
                </div>
              </div>

              {/* Quick Actions & Recent Sales */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-6">
                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-white mb-4">Vendas Pix Recentes</h3>
                  <div className="space-y-3">
                    {sales.slice(0, 5).map(sale => (
                      <div key={sale.id} className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800/60">
                        <div>
                          <div className="font-medium text-white text-sm">{sale.clientName}</div>
                          <div className="text-xs text-zinc-500 font-mono">
                            {new Date(sale.createdAt).toLocaleDateString()} • {sale.product}
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-sm font-bold text-emerald-400 font-mono">R$ {sale.amount.toFixed(2)}</div>
                          <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                            sale.status === 'pago' ? 'bg-emerald-500/10 text-emerald-400' :
                            sale.status === 'pendente' ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                          }`}>
                            {sale.status}
                          </span>
                        </div>
                      </div>
                    ))}
                    {sales.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-6">Nenhuma venda Pix registrada ainda.</p>
                    )}
                  </div>
                </div>

                <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6">
                  <h3 className="text-base font-semibold text-white mb-4">Testes Gratuitos Recentes (120 min)</h3>
                  <div className="space-y-3">
                    {trials.slice(0, 5).map(trial => {
                      const now = new Date();
                      const exp = new Date(trial.trialExpiresAt);
                      const isExpired = now >= exp;
                      const remainingSec = Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 1000));
                      const remMin = Math.floor(remainingSec / 60);

                      return (
                        <div key={trial.id} className="flex items-center justify-between p-3 bg-zinc-950 rounded-xl border border-zinc-800/60">
                          <div>
                            <div className="font-mono text-white text-xs truncate max-w-[200px]">{trial.deviceId}</div>
                            <div className="text-xs text-zinc-500">{trial.deviceInfo || 'Android'}</div>
                          </div>
                          <div className="text-right">
                            <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full ${
                              !isExpired ? 'bg-amber-500/10 text-amber-400' : 'bg-red-500/10 text-red-400'
                            }`}>
                              {!isExpired ? `${remMin}m restantes` : 'EXPIRADO'}
                            </span>
                            <div className="text-[10px] text-zinc-500 font-mono mt-1">
                              {new Date(trial.trialStartedAt).toLocaleTimeString()}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    {trials.length === 0 && (
                      <p className="text-xs text-zinc-500 text-center py-6">Nenhum teste gratuito iniciado ainda.</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CLIENTS */}
          {activeTab === 'clients' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Gerenciamento de Clientes</h2>
                  <p className="text-sm text-zinc-400">Cadastre, edite e pesquise clientes do WhatsTransmição PRO.</p>
                </div>
                <button
                  type="button"
                  onClick={handleOpenNewClientModal}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm flex items-center justify-center space-x-2 transition cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>Novo Cliente</span>
                </button>
              </div>

              <div className="relative">
                <Search className="absolute left-3.5 top-3 h-4 w-4 text-zinc-500" />
                <input
                  type="text"
                  placeholder="Pesquisar por nome, e-mail ou telefone..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500 transition"
                />
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase bg-zinc-900/80">
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Contato</th>
                      <th className="p-4">Cadastrado em</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {clients
                      .filter(c => 
                        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
                        c.phone.includes(searchTerm)
                      )
                      .map((client) => (
                        <tr key={client.id} className="hover:bg-zinc-800/40 transition">
                          <td className="p-4 font-medium text-white">
                            <div className="font-semibold">{client.name}</div>
                            <div className="text-xs text-zinc-500 font-mono">ID: {client.id}</div>
                          </td>
                          <td className="p-4 text-zinc-300">
                            <div>{client.email}</div>
                            <div className="text-xs text-zinc-500">{client.phone}</div>
                          </td>
                          <td className="p-4 text-zinc-400 font-mono text-xs">
                            {new Date(client.createdAt).toLocaleDateString()}
                          </td>
                          <td className="p-4 text-right space-x-2">
                            {/* EDIT BUTTON */}
                            <button
                              type="button"
                              onClick={() => handleOpenEditClientModal(client)}
                              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 text-emerald-400 rounded-xl transition cursor-pointer inline-flex items-center justify-center shadow-md border border-zinc-700/50 hover:border-emerald-500/40"
                              title="Editar Cliente"
                            >
                              <Edit className="h-4 w-4" />
                            </button>
                            {/* DELETE BUTTON */}
                            <button
                              type="button"
                              onClick={() => promptDeleteClient(client)}
                              className="p-2.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-xl transition cursor-pointer inline-flex items-center justify-center shadow-md border border-red-500/30 hover:border-red-500"
                              title="Excluir Cliente"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          </td>
                        </tr>
                      ))}
                    {clients.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-zinc-500">
                          Nenhum cliente cadastrado. Clique no botão "Novo Cliente" para adicionar.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: SALES & PIX */}
          {activeTab === 'sales' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Vendas & Pix Oficial (R$ 239,90)</h2>
                  <p className="text-sm text-zinc-400">Gere cobranças Pix com QR Code e Pix Copia e Cola para o WhatsTransmição PRO.</p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowSaleModal(true)}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-4 py-2.5 rounded-xl text-sm flex items-center justify-center space-x-2 transition cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  <Plus className="h-4 w-4" />
                  <span>Nova Venda Pix</span>
                </button>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase bg-zinc-900/80">
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Produto / Valor</th>
                      <th className="p-4">Status Pix</th>
                      <th className="p-4">Data</th>
                      <th className="p-4 text-right">Ações Pix</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-4 font-medium text-white">
                          <div>{sale.clientName}</div>
                          <div className="text-xs text-zinc-500 font-mono">Venda ID: {sale.id}</div>
                        </td>
                        <td className="p-4 text-zinc-300">
                          <div>{sale.product}</div>
                          <div className="text-xs font-bold text-emerald-400 font-mono">R$ {sale.amount.toFixed(2)}</div>
                        </td>
                        <td className="p-4">
                          <span className={`px-2.5 py-1 rounded-full text-xs font-mono uppercase font-semibold ${
                            sale.status === 'pago' ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                            sale.status === 'pendente' ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                            'bg-red-500/10 text-red-400 border border-red-500/30'
                          }`}>
                            {sale.status}
                          </span>
                        </td>
                        <td className="p-4 text-zinc-400 font-mono text-xs">
                          {new Date(sale.createdAt).toLocaleString()}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {sale.status === 'pendente' && (
                            <>
                              <button
                                type="button"
                                onClick={() => handleShowPix(sale)}
                                className="px-3 py-1.5 bg-emerald-600/10 hover:bg-emerald-600/20 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
                              >
                                Ver Pix / QR
                              </button>
                              <button
                                type="button"
                                onClick={() => handleUpdateSaleStatus(sale.id, 'pago')}
                                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-medium transition cursor-pointer shadow-md"
                              >
                                Aprovar Manual
                              </button>
                            </>
                          )}
                          {sale.status === 'pago' && (
                            <span className="text-xs text-emerald-400 font-mono font-bold">Pago & Licença Gerada</span>
                          )}
                          <button
                            type="button"
                            onClick={() => promptDeleteSale(sale)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg text-xs transition cursor-pointer border border-red-500/20 inline-flex items-center justify-center ml-2"
                            title="Excluir Venda"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {sales.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhuma venda registrada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: LICENSES */}
          {activeTab === 'licenses' && (
            <div className="space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl font-bold tracking-tight text-white">Sistema de Licenciamento</h2>
                  <p className="text-sm text-zinc-400">Gere chaves, vincule a clientes e gerencie instalações Android autorizadas.</p>
                </div>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase bg-zinc-900/80">
                      <th className="p-4">Chave de Licença</th>
                      <th className="p-4">Cliente</th>
                      <th className="p-4">Status & Dispositivo</th>
                      <th className="p-4">Última Validação</th>
                      <th className="p-4 text-right">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {licenses.map((lic) => (
                      <tr key={lic.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-4 font-mono font-bold text-white flex items-center space-x-2">
                          <span>{lic.key}</span>
                          <button
                            type="button"
                            onClick={() => copyToClipboard(lic.key)}
                            className="p-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg transition cursor-pointer"
                            title="Copiar Chave"
                          >
                            {copiedKey === lic.key ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                          </button>
                        </td>
                        <td className="p-4 text-zinc-300">
                          {lic.clientName}
                        </td>
                        <td className="p-4">
                          <div className="space-y-1">
                            <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-mono uppercase font-semibold ${
                              lic.status === 'ativa' && lic.deviceId ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/30' :
                              lic.status === 'bloqueada' ? 'bg-red-500/10 text-red-400 border border-red-500/30' :
                              'bg-zinc-800 text-zinc-400'
                            }`}>
                              {lic.deviceId ? 'Ativada no Dispositivo' : 'Inativa / Aguardando Instalação'}
                            </span>
                            {lic.deviceId && (
                              <div className="text-[11px] text-zinc-500 font-mono">DevID: {lic.deviceId.substring(0, 16)}...</div>
                            )}
                          </div>
                        </td>
                        <td className="p-4 text-zinc-400 font-mono text-xs">
                          {lic.lastValidatedAt ? new Date(lic.lastValidatedAt).toLocaleString() : 'Nunca validada'}
                        </td>
                        <td className="p-4 text-right space-x-2">
                          {lic.deviceId && (
                            <button
                              type="button"
                              onClick={() => promptResetDevice(lic)}
                              className="px-2.5 py-1.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 rounded-lg text-xs font-medium transition cursor-pointer"
                              title="Liberar dispositivo para transferência"
                            >
                              Resetar Dispositivo
                            </button>
                          )}
                          {lic.status !== 'bloqueada' ? (
                            <button
                              type="button"
                              onClick={() => handleUpdateLicenseStatus(lic.id, 'bloqueada')}
                              className="px-2.5 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-xs font-medium transition cursor-pointer"
                            >
                              Bloquear
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleUpdateLicenseStatus(lic.id, 'inativa')}
                              className="px-2.5 py-1.5 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-xs font-medium transition cursor-pointer"
                            >
                              Desbloquear
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => promptDeleteLicense(lic)}
                            className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg text-xs transition cursor-pointer border border-red-500/20 inline-flex items-center justify-center ml-1"
                            title="Excluir Licença"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    ))}
                    {licenses.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhuma chave de licença gerada.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: TRIALS */}
          {activeTab === 'trials' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Testes Gratuitos (2 Horas / 120 min)</h2>
                <p className="text-sm text-zinc-400">Monitore dispositivos em avaliação gratuita, tempo restante e gerencie extensões.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase bg-zinc-900/80">
                      <th className="p-4">Dispositivo ID</th>
                      <th className="p-4">Info do Aparelho</th>
                      <th className="p-4">Status & Tempo</th>
                      <th className="p-4">Início / Expiração</th>
                      <th className="p-4 text-right">Ações Administrativas</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {trials.map((trial) => {
                      const now = new Date();
                      const exp = new Date(trial.trialExpiresAt);
                      const isExpired = now >= exp;
                      const remainingSec = Math.max(0, Math.floor((exp.getTime() - now.getTime()) / 1000));
                      const remMin = Math.floor(remainingSec / 60);

                      return (
                        <tr key={trial.id} className="hover:bg-zinc-800/40 transition">
                          <td className="p-4 font-mono text-xs text-white">
                            {trial.deviceId}
                          </td>
                          <td className="p-4 text-zinc-300 text-xs">
                            {trial.deviceInfo || 'Android Device'}
                          </td>
                          <td className="p-4">
                            <span className={`px-2.5 py-1 rounded-full text-xs font-mono uppercase font-semibold ${
                              !isExpired ? 'bg-amber-500/10 text-amber-400 border border-amber-500/30' :
                              'bg-red-500/10 text-red-400 border border-red-500/30'
                            }`}>
                              {!isExpired ? `TRIAL ATIVO (${remMin}m restantes)` : 'TRIAL EXPIRADO'}
                            </span>
                          </td>
                          <td className="p-4 text-zinc-400 font-mono text-xs">
                            <div>Início: {new Date(trial.trialStartedAt).toLocaleTimeString()}</div>
                            <div className="text-zinc-500">Expira: {new Date(trial.trialExpiresAt).toLocaleTimeString()}</div>
                          </td>
                          <td className="p-4 text-right space-x-2">
                            <button
                              type="button"
                              onClick={() => promptExtendTrial(trial)}
                              className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 text-emerald-400 border border-emerald-500/30 rounded-lg text-xs font-medium transition cursor-pointer"
                              title="Conceder +2 horas de teste"
                            >
                              Estender +2h
                            </button>
                            <button
                              type="button"
                              onClick={() => promptDeleteTrial(trial)}
                              className="p-1.5 bg-red-500/10 hover:bg-red-500/25 text-red-400 rounded-lg text-xs transition cursor-pointer border border-red-500/20 inline-flex items-center justify-center ml-1"
                              title="Excluir Registro de Teste"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                    {trials.length === 0 && (
                      <tr>
                        <td colSpan={5} className="p-8 text-center text-zinc-500">Nenhum teste gratuito iniciado.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* TAB: API DOCS */}
          {activeTab === 'api_docs' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Documentação da API Android (Kotlin) & Pix (R$ 239,90)</h2>
                <p className="text-sm text-zinc-400">Endpoints para Teste Gratuito, Licenciamento e Pix de R$ 239,90.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl p-6 space-y-6 shadow-xl">
                <div>
                  <h3 className="text-base font-semibold text-white mb-2">URLs Base Públicas da API (Sem Login Google / JSON Puro)</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-emerald-400 space-y-2">
                    <div><span className="text-zinc-500 uppercase">Produção Vercel:</span> https://whatstransmissao.vercel.app</div>
                    <div><span className="text-zinc-500 uppercase">Ambiente AI Studio:</span> https://ais-pre-bya6err3d42jh3gdfqfy76-7333253531.us-east5.run.app</div>
                    <div className="text-zinc-400 text-[11px] pt-1">Todas as rotas retornam exclusivamente Content-Type: application/json e possuem CORS liberado (*) para o APK Android.</div>
                  </div>
                </div>

                <div className="space-y-2">
                  <h3 className="text-base font-semibold text-white">Chave Pix Copia e Cola Oficial (R$ 239,90)</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-emerald-400 break-all">
                    {FIXED_PIX_CODE}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">1. Iniciar Teste Gratuito de 120 Minutos</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">POST /api/trial/start</div>
                    <pre className="text-zinc-400 mt-1">{`// Request
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_info": "Samsung Galaxy S24 / Android 14"
}

// Response 200 OK
{
  "success": true,
  "state": "TRIAL_ACTIVE",
  "trial_started_at": "2026-10-21T06:00:00.000Z",
  "trial_expires_at": "2026-10-21T08:00:00.000Z",
  "remaining_seconds": 7200,
  "message": "Teste gratuito de 2 horas iniciado com sucesso!"
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">2. Consulta de Status do Teste ou Licença</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">POST /api/trial/status</div>
                    <pre className="text-zinc-400 mt-1">{`// Request
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "license_key": ""
}

// Estados possíveis: TRIAL_ACTIVE, TRIAL_EXPIRED, LICENSE_ACTIVE, LICENSE_BLOCKED, UNKNOWN
// Response 200 OK (Dispositivo novo: state = "UNKNOWN", nunca 404)
{
  "success": true,
  "state": "TRIAL_ACTIVE",
  "remaining_seconds": 4500,
  "trial_expires_at": "2026-10-21T08:00:00.000Z",
  "license_key": "",
  "server_time": "2026-10-21T06:45:00.000Z"
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">3. Ativação de Licença Vitalícia (1 Dispositivo por Chave)</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">POST /api/license/activate</div>
                    <pre className="text-zinc-400 mt-1">{`// Request
{
  "key": "WST-PRO-A1B2-C3D4-E5F6",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "device_info": "Xiaomi 13 Pro / Android 15"
}

// Response 200 OK (token HMAC com 7 dias de validade offline)
{
  "success": true,
  "state": "LICENSE_ACTIVE",
  "license_key": "WST-PRO-A1B2-C3D4-E5F6",
  "activated_at": "2026-10-21T12:00:00.000Z",
  "token": "...",
  "expires_at": "2026-10-28T12:00:00.000Z",
  "message": "Licença ativada com sucesso."
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">4. Revalidação e Renovação do Token Offline</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">POST /api/license/validate</div>
                    <pre className="text-zinc-400 mt-1">{`// Request
{
  "key": "WST-PRO-A1B2-C3D4-E5F6",
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "token": "..."
}

// Response 200 OK (renova token para mais 7 dias)
{
  "success": true,
  "state": "LICENSE_ACTIVE",
  "license_key": "WST-PRO-A1B2-C3D4-E5F6",
  "token": "...",
  "expires_at": "2026-10-28T12:00:00.000Z",
  "server_time": "2026-10-21T12:00:00.000Z"
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">5. Criar Cobrança Pix pelo APK</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">POST /api/pix/create</div>
                    <pre className="text-zinc-400 mt-1">{`// Request
{
  "device_id": "550e8400-e29b-41d4-a716-446655440000",
  "amount": 239.90,
  "description": "Licença vitalícia WhatsTransmissão PRO"
}

// Response 200 OK
{
  "success": true,
  "order_id": "ord_1729519200_a1b2",
  "pix_payload": "00020126720014BR.GOV.BCB.PIX...",
  "pix_qr_code": "https://i.ibb.co/HfyQkFbT/image.png",
  "expires_at": "2026-10-22T12:00:00.000Z",
  "status": "PENDING"
}`}</pre>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-base font-semibold text-white">6. Polling do Pedido pelo APK (Confirmação Automática)</h3>
                  <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 font-mono text-xs text-zinc-300 space-y-2">
                    <div className="text-emerald-400 font-bold">GET /api/order/:order_id</div>
                    <pre className="text-zinc-400 mt-1">{`// Quando Pendente (Polling a cada 3s no APK):
{
  "success": true,
  "order_id": "ord_1729519200_a1b2",
  "status": "PENDING",
  "message": "Aguardando confirmação do pagamento Pix."
}

// Quando Aprovado pelo Administrador no Painel Web:
{
  "success": true,
  "order_id": "ord_1729519200_a1b2",
  "status": "PAID",
  "paid_at": "2026-10-21T12:30:00.000Z",
  "license_key": "WST-PRO-A1B2-C3D4-E5F6"
}`}</pre>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'audit' && (
            <div className="space-y-6">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-white">Logs de Auditoria</h2>
                <p className="text-sm text-zinc-400">Histórico de ações administrativas e eventos do sistema.</p>
              </div>

              <div className="bg-zinc-900 border border-zinc-800 rounded-2xl overflow-hidden shadow-xl">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-zinc-800 text-xs font-mono text-zinc-400 uppercase bg-zinc-900/80">
                      <th className="p-4">Ação</th>
                      <th className="p-4">Administrador</th>
                      <th className="p-4">Detalhes</th>
                      <th className="p-4">Data/Hora</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-800 text-sm">
                    {auditLogs.map((log) => (
                      <tr key={log.id} className="hover:bg-zinc-800/40 transition">
                        <td className="p-4 font-mono font-bold text-emerald-400">
                          {log.action}
                        </td>
                        <td className="p-4 text-zinc-300">
                          {log.adminEmail}
                        </td>
                        <td className="p-4 text-zinc-400">
                          {log.details}
                        </td>
                        <td className="p-4 text-zinc-500 font-mono text-xs">
                          {new Date(log.createdAt).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                    {auditLogs.length === 0 && (
                      <tr>
                        <td colSpan={4} className="p-8 text-center text-zinc-500">Nenhum log registrado ainda.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>
      </div>

      {/* MODAL: PIX QR CODE & COPIA E COLA */}
      {pixModalData && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-lg w-full p-6 space-y-6 text-center shadow-2xl">
            <div className="mx-auto bg-emerald-500/10 border border-emerald-500/30 w-16 h-16 rounded-2xl flex items-center justify-center text-emerald-400">
              <QrCode className="h-8 w-8" />
            </div>
            <div>
              <h3 className="text-xl font-bold text-white">Pix para Licença Vitalícia (R$ 239,90)</h3>
              <p className="text-sm text-zinc-400">Titular: <span className="text-white font-medium">Pedro Igor Alves da Silva</span></p>
              <p className="text-xs text-zinc-500">Cliente: {pixModalData.clientName}</p>
            </div>

            {/* QR Code Image */}
            <div className="bg-white p-4 rounded-xl inline-block mx-auto border border-zinc-800 shadow-md">
              <img src={pixModalData.qrImage} alt="QR Code Pix" className="w-48 h-48 object-contain mx-auto" />
            </div>

            <div className="bg-zinc-950 p-4 rounded-xl border border-zinc-800 space-y-3">
              <div className="text-xs font-mono text-zinc-400 uppercase">Pix Copia e Cola</div>
              <div className="bg-zinc-900 p-3 rounded-lg font-mono text-xs text-emerald-400 break-all max-h-28 overflow-y-auto">
                {pixModalData.pixCode}
              </div>
              <button
                type="button"
                onClick={() => copyToClipboard(pixModalData.pixCode)}
                className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-medium py-2.5 rounded-xl text-xs flex items-center justify-center space-x-2 transition cursor-pointer shadow-lg shadow-emerald-600/20"
              >
                <Copy className="h-4 w-4" />
                <span>{copiedKey === pixModalData.pixCode ? 'Pix Copiado!' : 'Copiar Código Pix Copia e Cola'}</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setPixModalData(null)}
              className="w-full py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl text-sm font-medium transition cursor-pointer"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      {/* MODAL: CLIENT FORM (CREATE / EDIT) */}
      {showClientModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">{editingClient ? 'Editar Cliente' : 'Novo Cliente'}</h3>
              <button
                type="button"
                onClick={() => setShowClientModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleSaveClient} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Nome Completo</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: João da Silva"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">E-mail</label>
                <input
                  type="email"
                  required
                  placeholder="Ex: joao@email.com"
                  value={clientForm.email}
                  onChange={(e) => setClientForm({ ...clientForm, email: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Telefone / WhatsApp</label>
                <input
                  type="text"
                  required
                  placeholder="Ex: 66 99977-5501"
                  value={clientForm.phone}
                  onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClientModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  Salvar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: SALE FORM */}
      {showSaleModal && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-md w-full p-6 space-y-6 shadow-2xl">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Criar Venda Pix (R$ 239,90)</h3>
              <button
                type="button"
                onClick={() => setShowSaleModal(false)}
                className="text-zinc-500 hover:text-zinc-300 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <form onSubmit={handleCreateSale} className="space-y-4">
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Cliente</label>
                <select
                  required
                  value={saleForm.clientId}
                  onChange={(e) => setSaleForm({ ...saleForm, clientId: e.target.value })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                >
                  <option value="">Selecione um cliente...</option>
                  {clients.map(c => (
                    <option key={c.id} value={c.id}>{c.name} ({c.email})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Produto</label>
                <input
                  type="text"
                  disabled
                  value="WhatsTransmição PRO - Vitalício"
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-400 cursor-not-allowed"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Valor (R$)</label>
                <input
                  type="number"
                  step="0.01"
                  value={saleForm.amount}
                  onChange={(e) => setSaleForm({ ...saleForm, amount: Number(e.target.value) })}
                  className="w-full bg-zinc-950 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-emerald-500 transition"
                />
              </div>
              <div>
                <label className="block text-xs font-mono text-zinc-400 uppercase mb-1">Forma de Pagamento</label>
                <input
                  type="text"
                  value={saleForm.paymentMethod}
                  disabled
                  className="w-full bg-zinc-900 border border-zinc-800 rounded-xl px-4 py-2.5 text-sm text-zinc-400"
                />
              </div>
              <div className="flex justify-end space-x-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSaleModal(false)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-xl text-sm transition cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-xl text-sm font-medium transition cursor-pointer shadow-lg shadow-emerald-600/20"
                >
                  Gerar Pix e QR Code
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
