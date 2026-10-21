# WhatsTransmissão License & Trial Manager — Backend REST API & APK Gateway

Especificação e arquitetura da API pública JSON sem restrição de autenticação Google para o APK Android do WhatsTransmissão PRO, integrando gerenciamento de teste gratuito (120 minutos), ativação de licenças vitalícias com token offline de 7 dias, cobrança Pix oficial de R$ 239,90 e confirmação manual no painel administrativo com polling em tempo real pelo APK.

## User Review & Critical Decisions

> [!IMPORTANT]
> **Decisões Confirmadas na Fase 1:**
> - **Fluxo Pix e Confirmação**: O APK gera pedidos com o Pix oficial pré-configurado de R$ 239,90 e entra em polling periódico via `GET /api/order/:order_id`. O administrador confere o comprovante ou extrato no painel web e clica em **"Confirmar Pagamento"**, gerando automaticamente a licença vitalícia e liberando o APK instantaneamente.
> - **Preço e Beneficiário**: Licença vitalícia tabelada em R$ 239,90 com chave Pix `39fe1e46-001d-499e-8bdb-4bd9a0746e6d` e QR Code oficial em nome de Pedro Igor Alves da Silva.
> - **Hospedagem Pública Sem Login Google**: Disponibilização da API em formato JSON puro (`Content-Type: application/json`) com CORS liberado para clientes mobile e Vercel Serverless Function (`api/index.ts` + `vercel.json`), garantindo que chamadas do APK em `https://whatstransmissao.vercel.app/api/*` nunca recebam páginas HTML ou exijam cookies de autenticação do Google.

---

## 1. Overview & Core Concept

- **O que faz**: Fornece uma camada de serviços RESTful segura, determinística e pública que gerencia todo o ciclo de vida do WhatsTransmissão no dispositivo Android:
  1. Concessão e cronometragem no servidor de 120 minutos de teste gratuito (`TRIAL_ACTIVE`, `TRIAL_EXPIRED`).
  2. Ativação vinculada a hardware único (`device_id`) com emissão de token criptográfico HMAC para operação offline de até 7 dias.
  3. Bloqueio imediato contra clonagem de chave em múltiplos aparelhos (`LICENSE_IN_USE`, `DEVICE_MISMATCH`).
  4. Criação de pedido Pix e sincronização em tempo real de liberação de licença (`PENDING` -> `PAID`).
- **Público-Alvo**: Usuários do aplicativo Android WhatsTransmissão PRO e o administrador do sistema que gerencia as licenças e valida pagamentos.
- **Valor Principal**: Resposta imediata em JSON puro para qualquer requisição HTTP mobile sem fricção de login, impedindo adulteração de relógio local e garantindo proteção antipirataria com chave exclusiva por instalação.

---

## 2. User Experience & Visual Design

### Fluxos do Usuário

```
[ Usuário abre o APK Android ]
        │
        ▼
   POST /api/trial/status
        │
   ┌────┴─────────────────────────────┐
   │                                  │
[ Estado: UNKNOWN ]         [ Estado: TRIAL_ACTIVE ] ────► [ Acesso Livre ]
   │                                  │                     (Restante: MM:SS)
   ▼                                  ▼
POST /api/trial/start       [ Estado: TRIAL_EXPIRED ]
   │                                  │
   ├─► Inicia 120 min                 ▼
   └─► Responde TRIAL_ACTIVE   [ Tela de Bloqueio & Compra Pix ]
                                      │
                                      ▼
                             POST /api/pix/create
                                      │
                                      ▼
                        Exibe Chave Pix & QR Code
                                      │
                        (Polling GET /api/order/:id)
                                      │
                         [ Admin confirma no Painel ]
                                      │
                                      ▼
                       Pedido Pago -> Retorna Chave
                                      │
                                      ▼
                           POST /api/license/activate
                                      │
                                      ▼
                       [ Licença Vitalícia Ativada! ]
```

### Experiência no Painel Administrativo Web
- **Aba "Pedidos Pix & Vendas"**: Listagem dos pedidos criados pelo APK com status em destaque (`Pendente` em amarelo, `Pago` em verde).
- **Botão de 1 Clique "Confirmar Pix & Liberar Licença"**:
  - Altera o status do pedido para `PAID`.
  - Gera automaticamente a chave de licença no padrão `WST-PRO-XXXX-XXXX-XXXX`.
  - No próximo ciclo de polling do APK (a cada 3-5s), o app Android detecta a liberação, ativa a licença e desbloqueia as transmissões.
- **Gerenciador de Dispositivos**: Visualização do `device_id` vinculado a cada licença com botão para "Transferir / Desvincular Dispositivo" caso o cliente troque de celular.

---

## 3. Key Product Decisions & Trade-Offs

- **Decisão 1: Servidor como Fonte Única de Tempo (`server_time`)**
  - *Abordagem*: O relógio do dispositivo Android nunca é consultado para verificar expiração de teste. O backend calcula `remaining_seconds = max(0, trial_expires_at - now_utc)` e envia `server_time` em ISO 8601.
  - *Por quê*: Impede que usuários contornem o teste de 2 horas retrocedendo o relógio do celular.
  - *Alternativas*: Validação local foi descartada por ser facilmente burlável.

- **Decisão 2: Token Criptográfico HMAC para Validação Offline de 7 Dias**
  - *Abordagem*: Ao ativar a licença, o backend emite um `token` assinado via HMAC-SHA256 contendo `device_id`, `license_key` e `expires_at` (7 dias). A cada validação online com sucesso, um novo token renovado é retornado.
  - *Por quê*: Permite que o cliente use o aplicativo mesmo sem conexão momentânea à internet, sem abrir mão da segurança antipirataria. Se passar de 7 dias sem internet, o APK exige reconexão.

- **Decisão 3: Roteamento Híbrido Vercel Serverless + Express Dev Server**
  - *Abordagem*: Criar `/api/index.ts` e `vercel.json` para que na Vercel as requisições em `/api/*` sejam tratadas diretamente pela função serverless Node.js, contornando o fallback SPA que devolvia `index.html`. Em ambiente local/dev, o `server.ts` continua ouvindo normalmente na porta 3000/3001.
  - *Por quê*: Resolve o problema do APK receber HTML em vez de JSON quando consome o domínio da Vercel.

---

## 4. Technical Architecture & Data Strategy

### Arquitetura de Comunicação e Componentes

```
┌────────────────────────────────────────────────────────┐
│                   Cliente Android (APK)                │
│    - WhatsTransmissão Core Engine                      │
│    - LicenseValidator (armazena token offline 7 dias)  │
│    - PixPollingWorker (consulta status do pedido)      │
└───────────────────────────┬────────────────────────────┘
                            │ HTTPS JSON Puro (Sem Auth Google)
                            ▼
┌────────────────────────────────────────────────────────┐
│             Vercel Serverless API / Express            │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Middlewares: CORS (All), JSON Parser, ErrorSafe │  │
│  └──────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────┐  │
│  │ Endpoints Públicos:                              │  │
│  │  • POST /api/trial/start                         │  │
│  │  • POST /api/trial/status                        │  │
│  │  • POST /api/license/activate                    │  │
│  │  • POST /api/license/validate                    │  │
│  │  • POST /api/pix/create                          │  │
│  │  • GET  /api/order/:order_id                     │  │
│  │  • POST /api/order/confirm-manual (Admin)        │  │
│  └──────────────────────────────────────────────────┘  │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│               Google Cloud Firestore                   │
│  • trials (deviceId, startedAt, expiresAt, status)     │
│  • licenses (key, deviceId, status, token)             │
│  • orders (orderId, deviceId, status, pixCode, key)    │
│  • clients & sales                                     │
└────────────────────────────────────────────────────────┘
```

### Contrato Exato dos Endpoints REST

#### 1. Iniciar Teste (`POST /api/trial/start`)
- **Headers**: `Content-Type: application/json`
- **Request**:
  ```json
  {
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "device_info": "Samsung Galaxy S24 / Android 14"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "state": "TRIAL_ACTIVE",
    "trial_started_at": "2026-10-21T06:00:00.000Z",
    "trial_expires_at": "2026-10-21T08:00:00.000Z",
    "remaining_seconds": 7200,
    "message": "Teste gratuito de 2 horas iniciado com sucesso!"
  }
  ```

#### 2. Status do Teste & Licença (`POST /api/trial/status`)
- **Request**:
  ```json
  {
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "license_key": ""
  }
  ```
- **Response (200 OK — Dispositivo Novo)**:
  ```json
  {
    "success": true,
    "state": "UNKNOWN",
    "remaining_seconds": 0,
    "trial_expires_at": null,
    "license_key": "",
    "server_time": "2026-10-21T07:00:00.000Z"
  }
  ```
- **Response (200 OK — Teste em Andamento)**:
  ```json
  {
    "success": true,
    "state": "TRIAL_ACTIVE",
    "remaining_seconds": 4520,
    "trial_expires_at": "2026-10-21T08:00:00.000Z",
    "license_key": "",
    "server_time": "2026-10-21T06:44:40.000Z"
  }
  ```
- **Response (200 OK — Licença Ativa)**:
  ```json
  {
    "success": true,
    "state": "LICENSE_ACTIVE",
    "remaining_seconds": 0,
    "trial_expires_at": null,
    "license_key": "WST-PRO-A1B2-C3D4-E5F6",
    "server_time": "2026-10-21T07:00:00.000Z"
  }
  ```

#### 3. Ativação de Licença (`POST /api/license/activate`)
- **Request**:
  ```json
  {
    "key": "WST-PRO-A1B2-C3D4-E5F6",
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "device_info": "Xiaomi 13 Pro / Android 15"
  }
  ```
- **Respostas**:
  - `200 OK`: `{"success": true, "state": "LICENSE_ACTIVE", "license_key": "...", "token": "...", "activated_at": "...", "message": "Licença ativada com sucesso."}`
  - `409 Conflict`: `{"success": false, "state": "LICENSE_IN_USE", "message": "Esta licença já está ativa em outro dispositivo. Solicite transferência ao suporte."}`
  - `400 Bad Request`: `{"success": false, "state": "INVALID_KEY", "message": "Chave de licença inválida ou inexistente."}`
  - `403 Forbidden`: `{"success": false, "state": "LICENSE_BLOCKED", "message": "Esta licença foi bloqueada ou revogada pela administração."}`

#### 4. Validação Contínua & Offline Token (`POST /api/license/validate`)
- **Request**:
  ```json
  {
    "key": "WST-PRO-A1B2-C3D4-E5F6",
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "token": "eyJhbGciOi..."
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "state": "LICENSE_ACTIVE",
    "license_key": "WST-PRO-A1B2-C3D4-E5F6",
    "token": "eyJhbGciOi...(novo token renovado)...",
    "expires_at": "2026-10-28T12:00:00.000Z",
    "server_time": "2026-10-21T12:00:00.000Z"
  }
  ```

#### 5. Criação de Pedido Pix (`POST /api/pix/create`)
- **Request**:
  ```json
  {
    "device_id": "550e8400-e29b-41d4-a716-446655440000",
    "amount": 239.90,
    "description": "Licença vitalícia WhatsTransmissão PRO"
  }
  ```
- **Response (200 OK)**:
  ```json
  {
    "success": true,
    "order_id": "ord_1729519200_a1b2",
    "pix_payload": "00020126720014BR.GOV.BCB.PIX013639fe1e46-001d-499e-8bbd-4bd9a0746e6d0210Vitalicio 5204000053039865406239.905802BR5925PEDRO IGOR ALVES DA SILVA6009SAO PAULO622605224XFv7wymjQUh3OViUZlCx56304A298",
    "pix_qr_code": "https://i.ibb.co/HfyQkFbT/image.png",
    "expires_at": "2026-10-22T12:00:00.000Z",
    "status": "PENDING"
  }
  ```

#### 6. Polling de Pedido pelo APK (`GET /api/order/:order_id`)
- **Response (200 OK — Pendente)**:
  ```json
  {
    "success": true,
    "order_id": "ord_1729519200_a1b2",
    "status": "PENDING",
    "message": "Aguardando confirmação do pagamento Pix."
  }
  ```
- **Response (200 OK — Pago & Liberado)**:
  ```json
  {
    "success": true,
    "order_id": "ord_1729519200_a1b2",
    "status": "PAID",
    "paid_at": "2026-10-21T12:30:00.000Z",
    "license_key": "WST-PRO-A1B2-C3D4-E5F6"
  }
  ```
