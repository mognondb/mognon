# Publicando o servidor do painel administrativo

O painel em `/admin/` precisa de um pequeno servidor para funcionar com segurança:
ele guarda o usuário/senha e o token do GitHub **longe do navegador**, e serve de
ponte entre o painel e a API do GitHub.

Esse servidor é um **Cloudflare Worker** — gratuito, sem cartão de crédito, e leva
uns 10 minutos para configurar. O código já está pronto em `admin/worker.js`, só
precisa colar.

## Passo a passo

### 1. Criar conta no Cloudflare
Acesse https://dash.cloudflare.com/sign-up e crie uma conta gratuita.

### 2. Criar o Worker
1. No painel do Cloudflare, vá em **Workers & Pages** (menu lateral)
2. Clique em **Create** → **Create Worker**
3. Dê um nome, por exemplo `cm-admin-api`, e clique em **Deploy** (cria um worker vazio, "Hello World")

### 3. Colar o código
1. Clique em **Edit code** (ou "Continue to project" → "Edit code")
2. Apague o conteúdo padrão e cole todo o conteúdo do arquivo `admin/worker.js` deste repositório
3. Clique em **Save and Deploy**

### 4. Configurar as variáveis secretas
1. Vá até a página do seu Worker → aba **Settings** → **Variables and Secrets**
2. Adicione cada uma destas variáveis (marcando como **Secret**, não "Text", para ficarem encriptadas):

| Nome | Valor |
|---|---|
| `ADMIN_USER` | `tmognon` (ou o usuário que você quiser) |
| `ADMIN_PASS` | `M0gnon2026` (ou a senha que você quiser) |
| `GH_TOKEN` | um token do GitHub — veja o passo 5 abaixo |
| `GH_OWNER` | `mognondb` |
| `GH_REPO` | `mognon` |
| `GH_BRANCH` | `master` (ou a branch que o GitHub Pages publica) |
| `ALLOWED_ORIGIN` | o endereço do site publicado, ex: `https://mognondb.github.io` (pode deixar `*` por enquanto se não souber) |

3. Clique em **Save and Deploy** novamente depois de adicionar todas

### 5. Gerar o token do GitHub (`GH_TOKEN`)
1. Acesse **github.com → foto do perfil → Settings**
2. **Developer settings → Personal access tokens → Fine-grained tokens**
3. **Generate new token**
4. Em "Repository access", escolha **Only select repositories** e selecione `mognon`
5. Em "Permissions → Repository permissions", defina **Contents: Read and write**
6. Gere o token e cole como valor de `GH_TOKEN` no passo 4

Esse token fica guardado só no Cloudflare, nunca aparece no site nem é enviado ao navegador de quem usa o painel.

### 6. Pegar o endereço do Worker
No painel do Worker, copie a URL mostrada (algo como `https://cm-admin-api.SEUUSUARIO.workers.dev`).

### 7. Configurar no painel
1. Acesse `seusite.com/admin/`
2. Abra **"Configurações do servidor"**
3. Cole a URL do passo 6 em "Endereço do servidor"
4. Faça login com o usuário e senha configurados no passo 4

Pronto — a partir daqui, o navegador guarda o endereço do servidor, e cada login
só pede usuário e senha.

## Trocar a senha depois

Edite as variáveis `ADMIN_USER`/`ADMIN_PASS` nas Settings do Worker (passo 4) e
clique em Deploy de novo. Não precisa mexer em nada no site nem no painel.

## Por que isso é mais seguro que o jeito anterior

Antes, o token do GitHub ficava guardado no navegador de quem acessava o painel
(em `localStorage`), o que funciona mas exige confiar no computador de cada
pessoa. Agora, o token nunca sai do servidor: o navegador só manda usuário/senha
a cada chamada, e é o Worker quem decide se autoriza ou não a leitura/gravação no
GitHub. Mesmo que alguém leia o código do site inteiro, não encontra nenhum
segredo nele.
