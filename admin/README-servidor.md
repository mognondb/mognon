# Publicando o servidor do painel administrativo

O painel em `/admin/` precisa de um pequeno servidor para funcionar com segurança:
ele guarda o usuário/senha do lado do servidor (nunca no navegador) e guarda os
dados dos infoprodutos e os dashboards de cada cliente num banco de dados do
próprio Cloudflare.

Esse servidor é um **Cloudflare Worker** — gratuito, sem cartão de crédito, **sem
precisar gerar token nenhum**. Leva uns 5 minutos. O código já está pronto em
`admin/worker.js`, só precisa colar.

## Passo a passo

### 1. Criar conta no Cloudflare
Acesse https://dash.cloudflare.com/sign-up e crie uma conta gratuita.

### 2. Criar o banco de dados (KV)
1. No painel do Cloudflare, vá em **Workers & Pages** → aba **KV** (menu lateral)
2. Clique em **Create namespace**
3. Dê um nome, por exemplo `cm-dados`, e clique em **Add**

### 3. Criar o Worker
1. Vá em **Workers & Pages** → **Create** → **Create Worker**
2. Dê um nome, por exemplo `cm-admin-api`, e clique em **Deploy** (cria um worker vazio)

### 4. Colar o código
1. Clique em **Edit code**
2. Apague o conteúdo padrão e cole todo o conteúdo do arquivo `admin/worker.js` deste repositório
3. Clique em **Save and Deploy**

### 5. Conectar o banco de dados ao Worker
1. Na página do seu Worker → aba **Settings** → **Bindings**
2. Clique em **Add binding** → **KV Namespace**
3. Em "Variable name" escreva exatamente **`CM_DATA`**
4. Em "KV Namespace" escolha o `cm-dados` criado no passo 2
5. Salve

### 6. Configurar usuário e senha
1. Ainda em **Settings** → **Variables and Secrets**
2. Adicione duas variáveis, marcando como **Secret** (para ficarem encriptadas):

| Nome | Valor |
|---|---|
| `ADMIN_USER` | `tmognon` (ou o usuário que você quiser) |
| `ADMIN_PASS` | `M0gnon2026` (ou a senha que você quiser) |

3. (Opcional) Adicione `ALLOWED_ORIGIN` com o endereço do site publicado, ex:
   `https://mognondb.github.io`. Se pular esse passo, funciona normalmente.
4. Clique em **Save and Deploy**

### 7. Pegar o endereço do Worker
No painel do Worker, copie a URL mostrada (algo como `https://cm-admin-api.SEUUSUARIO.workers.dev`).

### 8. Configurar no painel
O endereço do Worker fica fixo em `admin/admin.js` (constante `API_URL`) — não
precisa colar em lugar nenhum na tela de login. Depois de publicar o Worker, passe
a URL do passo 7 (ou me avise) para atualizar essa constante. A partir daí, acesse
`seusite.com/admin/` e faça login só com usuário e senha.

### 9. (Opcional) O site público mostrar os dados em tempo real
Hoje o site lê os infoprodutos/dashboards dos arquivos
`assets/data/infoprodutos.json` e `assets/data/dashboards.json`, que só mudam
quando alguém edita o código. Para o site mostrar instantaneamente o que for
cadastrado pelo painel (sem precisar editar nada), me avise com a URL do passo 7
que eu configuro o site para buscar os dados direto do servidor.

## Trocar a senha depois

Edite as variáveis `ADMIN_USER`/`ADMIN_PASS` nas Settings do Worker (passo 6) e
clique em Deploy de novo. Não precisa mexer em nada no site nem no painel.

## Por que isso é seguro

O usuário e a senha ficam guardados só no Cloudflare (nunca no código do site).
O navegador manda usuário/senha a cada ação, e é o Worker quem decide se autoriza
ou não. Mesmo que alguém leia o código do site inteiro, não encontra nenhum
segredo nele — e não existe token de GitHub nem de nenhum outro serviço envolvido.
