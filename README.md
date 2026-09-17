# Anjos da Praia

Tecnologia para apoiar a localização de crianças perdidas nas praias, desenvolvido para o Hackathon de Ciência da Computação 2026.2 — Anhanguera Guarapari, em parceria com a Associação Anjos da Praia.

## Sumário

- [Problema](#problema)
- [Solução proposta](#solução-proposta)
- [Funcionalidades](#funcionalidades)
- [Arquitetura](#arquitetura)
- [Tecnologias](#tecnologias)
- [Estrutura de diretórios](#estrutura-de-diretórios)
- [Modelo de dados](#modelo-de-dados)
- [Perfis de acesso](#perfis-de-acesso)
- [Fluxo principal](#fluxo-principal)
- [Endpoints da API](#endpoints-da-api)
- [Requisitos](#requisitos)
- [Instalação e execução local](#instalação-e-execução-local)
- [Variáveis de ambiente](#variáveis-de-ambiente)
- [Usuários de demonstração](#usuários-de-demonstração)
- [Roteiro de demonstração](#roteiro-de-demonstração)
- [Segurança](#segurança)
- [LGPD e privacidade](#lgpd-e-privacidade)
- [Limitações do MVP](#limitações-do-mvp)
- [Melhorias futuras](#melhorias-futuras)

## Problema

A Associação Anjos da Praia realiza ações gratuitas de utilidade pública em praias do Espírito Santo. Um dos problemas recorrentes é a perda momentânea de crianças em praias lotadas. Hoje o processo depende do número da pulseira física e da comunicação manual entre equipes, o que atrasa o reencontro em momentos críticos.

## Solução proposta

Uma plataforma web (sem necessidade de instalar aplicativo) que digitaliza o fluxo: cadastro rápido da família na tenda, pulseira numerada para a criança, e uma página pública acessível por QR Code para que qualquer pessoa que encontre uma criança perdida consiga, em poucos toques, acionar a equipe com localização geográfica. A equipe acompanha e atualiza o atendimento até o reencontro.

## Funcionalidades

MVP (entregue):
- Login com controle de acesso por perfil (RBAC validado no backend)
- Cadastro rápido de família + criança + pulseira (dado mínimo, LGPD)
- Busca de pulseira por número
- Página pública "Encontrei uma criança" (QR Code): número da pulseira, geolocalização com alternativa manual, criação automática de ocorrência
- Painel com cards de status e lista de ocorrências, com destaque para novas
- Tela de ocorrência com dados mínimos para a equipe, histórico e botões grandes de transição de status
- Encerramento do atendimento (reencontro realizado)

Diferenciais incluídos:
- Mapa de ocorrências e tendas com Leaflet/OpenStreetMap (uso restrito à equipe)
- Suporte a QR Code individual por pulseira via token público opaco, sem expor IDs internos
- Identificação automática da tenda ativa mais próxima de cada ocorrência (haversine)
- Notificações em tempo real no painel via WebSocket (com polling como rede de segurança)
- Relatórios (famílias, crianças, ocorrências por praia/tenda/horário, tempo médio de atendimento)
- Rotina de retenção/expurgo de dados pessoais (LGPD), automática (diária) e sob demanda
- PWA: casco da página pública em cache para resistir a conexão instável
- Cadastro de tendas, praias, equipes e usuários pelo administrador

## Arquitetura

```mermaid
flowchart LR
    subgraph Cliente
        Publico["Página pública /encontrei\n(sem login)"]
        Painel["Painel administrativo\n(React SPA)"]
    end

    subgraph Backend["API REST (Express + TypeScript)"]
        Auth[Auth JWT]
        RBAC[Middleware RBAC]
        Routes[Rotas de domínio]
    end

    DB[(PostgreSQL via Prisma)]

    Publico -- HTTPS/JSON --> Routes
    Painel -- HTTPS/JSON + cookie httpOnly --> Auth --> RBAC --> Routes
    Routes --> DB
```

Decisão de banco: o projeto usa **PostgreSQL** via Prisma, com migração inicial em `backend/prisma/migrations`. O ambiente local também precisa de uma instância PostgreSQL separada de produção. `DATABASE_URL` é a conexão da aplicação; `DIRECT_URL` é a conexão direta usada pelas ferramentas de migração.

## Tecnologias

| Camada | Tecnologia |
|---|---|
| Frontend | React + TypeScript + Vite + Tailwind CSS + React Router + PWA (vite-plugin-pwa) |
| Mapas | Leaflet + react-leaflet + OpenStreetMap (gratuito) |
| QR Code | qrcode.react |
| Tempo real | Socket.IO (servidor e cliente) |
| Backend | Node.js + TypeScript + Express |
| ORM / Banco | Prisma + PostgreSQL |
| Autenticação | JWT em cookie httpOnly + bcrypt + proteção CSRF (double-submit cookie) |
| Validação | Zod (validação server-side em toda rota que recebe dados) |
| Segurança | helmet, cors, express-rate-limit, auditoria em banco |
| Agendamento | node-cron (rotina diária de retenção de dados) |

## Estrutura de diretórios

```
HACKATHON/
├── backend/
│   ├── prisma/
│   │   ├── schema.prisma       # modelo de dados
│   │   └── seed.ts             # dados fictícios de demonstração
│   └── src/
│       ├── config/env.ts
│       ├── constants/enums.ts  # Role / IncidentStatus / WristbandStatus
│       ├── lib/prisma.ts
│       ├── middlewares/        # auth (JWT + RBAC), validate (Zod), errorHandler
│       ├── routes/             # um arquivo por domínio (families, incidents, public...)
│       ├── utils/audit.ts
│       ├── app.ts
│       └── index.ts
└── frontend/
    └── src/
        ├── components/         # Layout, StatusBadge, ProtectedRoute
        ├── context/AuthContext.tsx
        ├── pages/
        │   ├── public/EncontreiPage.tsx   # fluxo do QR Code
        │   ├── auth/LoginPage.tsx
        │   ├── dashboard/                 # painel + detalhe da ocorrência
        │   ├── admin/                     # cadastro, tendas, usuários, relatórios, QR
        │   └── MapPage.tsx
        ├── services/api.ts     # wrapper fetch com timeout e tratamento de erro
        └── types/index.ts
```

## Modelo de dados

Entidades principais (ver `backend/prisma/schema.prisma` para os campos completos): `User`, `Beach`, `Tent`, `Family`, `Child`, `Wristband`, `Incident`, `IncidentStatusHistory`, `Team`, `AuditLog`.

```mermaid
erDiagram
    FAMILY ||--o{ CHILD : possui
    CHILD ||--o{ WRISTBAND : usa
    WRISTBAND ||--o{ INCIDENT : gera
    BEACH ||--o{ TENT : tem
    BEACH ||--o{ INCIDENT : localizada_em
    TEAM ||--o{ INCIDENT : atende
    INCIDENT ||--o{ INCIDENT_STATUS_HISTORY : registra
    USER ||--o{ FAMILY : cadastra
    USER ||--o{ INCIDENT_STATUS_HISTORY : altera
```

Índices relevantes: `wristbands.printedNumber` (único, busca rápida por pulseira), `wristbands.publicIdentifier` (token opaco usado no QR individual — nunca o ID sequencial interno).

Os campos de perfil e status são strings por compatibilidade com a versão inicial do MVP. Os valores aceitos são definidos em `backend/src/constants/enums.ts` e validados na API.

## Perfis de acesso

| Perfil | Pode |
|---|---|
| **ADMIN** | Tudo: usuários, tendas, praias, equipes, relatórios, cancelar ocorrências |
| **ATENDENTE** | Cadastrar família/criança/pulseira, buscar pulseiras, ver e avançar ocorrências |
| **EQUIPE_CAMPO** | Ver ocorrências, mapa, avançar status, concluir reencontro |
| **Público** | Só o fluxo `/encontrei` — sem login, sem acesso a dados pessoais |

A autorização é validada **no backend** (middleware `authorize()` em cada rota), não apenas escondendo botões na UI.

## Fluxo principal

```mermaid
sequenceDiagram
    participant F as Quem encontrou a criança
    participant W as App público (/encontrei)
    participant A as API
    participant P as Painel da equipe

    F->>W: Escaneia QR Code
    F->>W: Informa número da pulseira
    W->>A: GET /public/wristbands/:numero/check
    A-->>W: existe? sim/não
    W->>F: Pede localização
    F->>W: Autoriza geolocalização
    W->>A: POST /public/incidents (número + lat/lng)
    A-->>W: Ocorrência criada
    W-->>F: "Alerta enviado!"
    A-->>P: Nova ocorrência aparece no painel (polling)
    P->>A: PATCH /incidents/:id/status (avança etapas)
    A-->>P: Reencontro realizado
```

## Endpoints da API

Base: `/api`

| Método | Rota | Acesso | Descrição |
|---|---|---|---|
| POST | `/auth/login` | público | Autenticação; define cookies `token` (httpOnly) e `csrfToken` |
| POST | `/auth/logout` | sessão via cookie / CSRF | Encerra a sessão (limpa os cookies no servidor) |
| GET | `/auth/me` | autenticado | Usuário logado |
| GET | `/public/wristbands/:printedNumber/check` | público | Verifica se a pulseira existe |
| GET | `/public/wristbands/by-token/:token/check` | público | Idem, por token do QR individual |
| GET | `/public/beaches` | público | Lista de praias (fallback sem geolocalização) |
| POST | `/public/incidents` | público (rate limited) | Cria a ocorrência a partir do QR Code |
| POST | `/families/intake` | ADMIN, ATENDENTE | Cadastro rápido família + criança + pulseira |
| GET | `/families`, `/families/:id` | ADMIN, ATENDENTE | Listagem/detalhe |
| GET | `/wristbands/search?printedNumber=` | ADMIN, ATENDENTE | Busca pulseira |
| GET | `/incidents` | autenticado | Lista ocorrências |
| GET | `/incidents/summary` | autenticado | Cards do painel |
| GET | `/incidents/:id` | autenticado | Detalhe com dados do responsável |
| PATCH | `/incidents/:id/status` | autenticado | Avança/cancela status (máquina de estados validada) |
| GET/POST | `/teams`, `/tents`, `/beaches` | autenticado / ADMIN | Cadastros de apoio |
| GET/POST/PATCH | `/users` | ADMIN | Gestão de usuários |
| GET | `/reports/overview` | ADMIN | Estatísticas (por praia, tenda mais próxima, horário) |
| POST | `/reports/data-retention/run` | ADMIN | Executa a rotina de anonimização (LGPD) sob demanda |

Requisições que alteram estado (POST/PATCH/DELETE) feitas com sessão via cookie precisam do header `X-CSRF-Token` com o valor do cookie `csrfToken` — o frontend já faz isso automaticamente em `services/api.ts`. No servidor persistente, as telas operacionais recebem `incident:created` e `incident:updated` por Socket.IO autenticado. Na configuração Vercel, utilizam polling a cada 20 segundos.

## Requisitos

- Node.js 22+
- npm

## Instalação e execução local

### Backend

```bash
cd backend
npm install
cp .env.example .env
# Configure DATABASE_URL e DIRECT_URL para um banco local/de desenvolvimento.
npx prisma migrate dev
npm run dev
```

A API sobe em `http://localhost:3333`. O comando `migrate dev` já roda o seed automaticamente (usuários e dados fictícios de demonstração).

### Frontend

```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

A aplicação sobe em `http://localhost:5173`. A página pública fica em `http://localhost:5173/encontrei`.

## Variáveis de ambiente

**backend/.env**
```
DATABASE_URL="postgresql://usuario:senha@localhost:5432/anjos_dev"
DIRECT_URL="postgresql://usuario:senha@localhost:5432/anjos_dev"
JWT_SECRET="troque-por-uma-string-longa-e-aleatoria-em-producao"
JWT_EXPIRES_IN="8h"
PORT=3333
CORS_ORIGIN="http://localhost:5173"
DATA_RETENTION_DAYS=90
# Somente no projeto Vercel do backend:
CRON_SECRET="segredo-aleatorio-exclusivo-do-agendador"
```

`NODE_ENV=production` em produção habilita a flag `secure` dos cookies de sessão (exige HTTPS).

**frontend/.env**
```
VITE_API_URL=http://localhost:3333/api
```

## Usuários de demonstração

Criados pelo seed (`senha123` para todos — **dados fictícios**, trocar antes de qualquer uso real):

| Perfil | E-mail |
|---|---|
| Administrador | admin@anjosdapraia.org |
| Atendente | atendente@anjosdapraia.org |
| Equipe de campo | equipe@anjosdapraia.org |

O seed também cria a praia "Praia de Camburi", uma tenda, uma equipe ("Equipe Azul") e a pulseira `#4821` disponível para o roteiro de demonstração.

## Roteiro de demonstração

1. Login como atendente → **Cadastro** → preencher responsável fictício (ex.: Carlos Almeida, (27) 99999-0000), criança (Lucas), pulseira `4821`.
2. Em outro dispositivo/aba, abrir `/encontrei` (ou escanear o QR gerado em **QR Code**, como admin).
3. Informar `4821` → autorizar localização → **ENVIAR ALERTA**.
4. Voltar ao **Painel**: a ocorrência aparece imediatamente com destaque "NOVA".
5. Abrir a ocorrência e avançar: Equipe a caminho → Criança recebida → Responsáveis localizados → Reencontro realizado.

## Segurança

- Senhas com hash bcrypt (nunca texto puro)
- Autenticação JWT em **cookie httpOnly** (inacessível via JavaScript, reduz o risco de roubo de sessão por XSS) + autorização por perfil validada em **todas** as rotas sensíveis no backend (nunca apenas escondendo botão na UI)
- Proteção **CSRF** (padrão double-submit cookie): toda requisição que altera estado com sessão via cookie exige o header `X-CSRF-Token` correspondente ao cookie `csrfToken`
- Validação e sanitização de entrada com Zod em todas as rotas que recebem dados do cliente
- Proteção contra SQL Injection via Prisma (queries parametrizadas, sem SQL manual)
- `helmet` (cabeçalhos HTTP seguros) e `cors` restrito à origem do frontend, com `credentials: true`
- Rate limiting dedicado no endpoint público de login e de criação de ocorrências
- Reenvios reutilizam qualquer ocorrência ainda aberta da mesma pulseira. Cadastro, criação de alerta e transições usam transações serializáveis com repetição limitada em conflitos
- Logs de auditoria (`audit_logs`) para cadastro e ações administrativas; cadastro e transições gravam auditoria dentro da mesma transação
- Contas inativas são recusadas em cada requisição; notificações WebSocket também revalidam a sessão
- Histórico de ocorrências retorna somente identificador e nome dos operadores
- Segredos via variáveis de ambiente, nunca hardcoded
- Em produção: servir sempre via HTTPS (ativa a flag `secure` dos cookies) e usar um `JWT_SECRET` forte e exclusivo

Pendências conhecidas para produção (fora do escopo do MVP do hackathon): rotação de tokens/refresh token, MFA para administradores, WAF/proteção adicional contra abuso no endpoint público, política formal de retenção de logs de auditoria.

## LGPD e privacidade

- **Minimização de dados**: o cadastro coleta apenas nome e telefone do responsável, primeiro nome da criança e uma observação opcional — nunca CPF, RG ou endereço.
- **Finalidade**: os dados só existem para viabilizar o reencontro durante a operação da Associação.
- A página pública do QR Code **nunca** expõe dados pessoais de crianças ou responsáveis — apenas confirma o recebimento do alerta.
- Dados de responsáveis só são visíveis para usuários autenticados e autorizados (equipe/atendente/admin), na tela de ocorrência.
- QR Code (genérico ou individual) nunca expõe o ID sequencial interno do banco — o identificador público (`publicIdentifier`) é um token opaco.
- Dados de demonstração neste repositório são **fictícios**.
- **Retenção automatizada**: considera cadastros antigos de toda a família e preserva seus dados enquanto houver criança/pulseira recente ou atendimento aberto/encerrado recentemente. Cadastros antigos sem ocorrências também são anonimizados. Pulseiras relacionadas são encerradas para impedir novos alertas sem dados de contato. Cancelamentos legados usam a data da transição no histórico; sem evidência de encerramento, os dados são preservados. A rotina roda às 03h de Brasília (06h UTC na Vercel) e também pode ser acionada em **Relatórios**.

## Limitações do MVP

- O tempo real cobre a criação e a mudança de status de ocorrências (WebSocket); o painel também mantém um polling de 20s como rede de segurança caso a conexão caia.
- PWA cobre o casco da aplicação (HTML/JS/CSS) para abrir mesmo com conexão instável; as chamadas que dependem de dado ao vivo (checar pulseira, enviar alerta) continuam exigindo rede — não há fila de envio offline.
- Testes de regressão em `backend/tests/regression.test.cjs`, executados com `npm test`. Usam um adaptador simulado e não instanciam um cliente de banco real. Cobrem autenticação, permissões, CSRF, validação, histórico, reenvio, retenção e tratamento de conflitos. A concorrência efetiva do PostgreSQL e o ambiente publicado ainda precisam de validação de integração.
- A auditoria atual de dependências não foi executada nesta revisão; os pacotes e suas versões foram preservados.
- Há configuração de publicação para Vercel, mas esta revisão não publicou nem alterou banco ou credenciais. O rate limit usa memória por instância; limites globais em produção exigem armazenamento compartilhado. Listagens e relatórios ainda precisam de paginação/agregação para volumes elevados.

## Melhorias futuras

1. Validar a publicação existente com PostgreSQL, cookies via proxy e execução do Cron
2. Fila de envio offline no fluxo público (sincroniza o alerta assim que a conexão voltar)
3. Rotação de refresh token e MFA para administradores
4. Histórico por edição do evento (hoje as estatísticas não distinguem edições/datas de operação)
5. QR Code individual por pulseira como padrão de impressão (arquitetura já suporta, via token `publicIdentifier`)

## Publicação e continuidade

- Frontend: `frontend/vercel.json` encaminha `/api` ao backend. O build de produção usa `VITE_API_URL=/api`, mantendo os cookies na origem do frontend. Atualize o destino do proxy ao mudar o projeto de backend.
- Backend: `backend/api/index.ts` exporta o Express para execução serverless. `backend/src/index.ts` inicia HTTP, Socket.IO e agendamento local somente no servidor persistente.
- Configure as variáveis do backend na hospedagem, incluindo `NODE_ENV=production`, `CORS_ORIGIN`, URLs do banco, `JWT_SECRET` e `CRON_SECRET`. Não use o seed de demonstração no banco real.
- O seed de produção cria somente um administrador; praias, tendas e equipes são cadastradas pela interface. Ele não redefine uma conta já existente.
- Horas dos relatórios, início do dia e agendamento local seguem Brasília. O agendamento Vercel está expresso em UTC.
- Não foi encontrado repositório Git nesta pasta. O histórico anterior do Claude não foi recriado; os arquivos e a arquitetura existentes foram preservados.

## Verificação local

```bash
cd backend
npm test
npm run build
cd ../frontend
npm run build
```

Os builds geram apenas artefatos locais. Nenhum desses comandos executa migrações, seed ou expurgo.
