# CM Soluções Financeiras — Site

Site estático (HTML/CSS/JS puro) para a CM Soluções Financeiras, publicado via GitHub Pages.

## Estrutura

```
index.html                 Página única com todas as seções
assets/css/style.css        Estilos
assets/js/main.js           Menu mobile, formulário de contato e renderização dinâmica
assets/data/infoprodutos.json  Dados dos infoprodutos (cadastrados via /admin/)
assets/downloads/           Planilhas gratuitas (CSV) disponíveis para download
assets/img/                 Logo e imagens
admin/                      Painel administrativo (escondido, não linkado no site)
admin/worker.js             Código do servidor (Cloudflare Worker) usado pelo painel
admin/cliente.html(.js)     Pasta de um cliente: lista e cadastra os dashboards dele
admin/construtor.html(.js/.css)  Construtor livre de dashboards (arrastar e soltar blocos)
admin/widgets.js(.css)      Motor de blocos (gráficos/tabela/KPI/texto) — compartilhado
                             entre o construtor e a apresentação
admin/relatorio.html(.js/.css)  Apresentação de um dashboard ao cliente
admin/README-servidor.md    Passo a passo para publicar o servidor
robots.txt                  Bloqueia indexação de /admin/ por buscadores
legacy-jekyll-boilerplate/  Arquivos antigos do scaffold padrão do GitHub Pages (não usados)
.nojekyll                   Desativa o processamento Jekyll para servir os arquivos como estão
```

## Seções da página

1. **Hero** — apresentação rápida da CM.
2. **Sobre** — quem é a CM e como ela trabalha.
3. **Serviços** — os níveis de apoio (Implantação, Acompanhamento, Assistência, Gestão) e o
   Diagnóstico Financeiro gratuito (abre um formulário em modal — veja mais abaixo).
4. **Infoprodutos** — planilhas gratuitas e produtos pagos (Hotmart), carregados do
   servidor do painel (ou de `assets/data/infoprodutos.json` como fallback).
5. **Contato / Relatório** — formulário para o cliente interessado preencher.

## Painel administrativo (`/admin/`)

Página **escondida** (não aparece no menu, bloqueada em `robots.txt`) para cadastrar
infoprodutos **sem editar código**.

- Acesse `seusite.com/admin/`
- Login: **usuário e senha**, só isso — verificados por um servidor próprio
  (Cloudflare Worker, gratuito, sem token de GitHub nem de nada) — veja
  **`admin/README-servidor.md`** para o passo a passo de publicá-lo (uma vez só,
  leva uns 5 minutos).
- O servidor guarda o usuário/senha como segredo e os dados cadastrados num banco
  de dados próprio do Cloudflare (KV) — nada disso fica no código do site. O
  navegador só envia usuário/senha a cada chamada; é o servidor quem decide se
  autoriza.
- Depois de configurado, o navegador lembra o endereço do servidor; o login do dia a
  dia é só usuário e senha.
- Cada "Salvar alterações" grava direto no servidor — fica no ar na hora, sem
  precisar de novo deploy do site.
- **Infoprodutos grátis**: o campo "link" deve apontar para um arquivo já existente em
  `assets/downloads/`. Para adicionar um arquivo novo, é preciso subir ele no repositório
  (o painel ainda não faz upload de arquivo).
- **Infoprodutos pagos**: o campo "link" é a URL de checkout da Hotmart
  (ex: `https://pay.hotmart.com/XXXXXXX`).

O painel não aparece no menu do site e é bloqueado em `robots.txt`, mas isso é só para
não aparecer em buscas — quem de fato impede alguém de salvar algo é o usuário/senha
verificado pelo servidor.

### Clientes: construtor de dashboards (apresentação ao vivo)

Uma terceira aba do painel, **"Clientes"**, funciona como uma pasta por cliente
(`admin/cliente.html?id=<id>`): dentro de cada cliente você cadastra quantos
dashboards quiser, um por período (ex.: Instituto Luanda → Setembro/2026,
Outubro/2026...), para apresentar numa reunião. Diferente dos infoprodutos (que são
públicos), **esses dados de cliente nunca são públicos**: tanto a leitura quanto a
gravação exigem login no servidor.

- **Aba "Clientes"** (`admin/index.html`): lista os clientes cadastrados, cria novos
  (nome + observações) e exclui (excluir um cliente apaga também todos os dashboards
  dele).
- **Dentro de um cliente** (`admin/cliente.html?id=<id>`): uma lista única de
  dashboards. O botão **"+ Novo dashboard"** oferece duas formas de criar um:
  1. **Construtor livre** (`admin/construtor.html`) — monte o dashboard do zero:
     clique num botão de bloco (Gráfico de barras, Linha, Pizza, Tabela, Indicador/KPI,
     Bloco de texto ou Segmentação por período) para adicioná-lo à tela, arraste-o
     pelo ícone ⠿⠿ para a posição desejada e arraste o canto inferior direito pra
     redimensionar. Preencha os dados de cada bloco manualmente (linha por linha) ou
     importando uma planilha (.xlsx — primeira coluna/linha como rótulo, demais como
     valores). Crie quantas abas quiser pelo botão **"+ Nova aba"** (clique duas vezes
     no nome de uma aba para renomeá-la).

     O bloco **Segmentação por período** cria botões (ex: "Jan/2026", "Fev/2026") que
     trocam os dados de todos os outros blocos da mesma aba de uma vez — ao editar
     qualquer outro bloco, a opção **"Aplicar a"** deixa escolher se o conteúdo é o
     mesmo para todos os períodos ou diferente por período.
  2. **Link público** — para quem já usa Power BI ou Looker Studio: cole o link de
     **"Publicar na web" / "Embed"** (não o link comum de acesso) e a apresentação
     mostra o dashboard embutido num iframe.

  Cada dashboard pode ser editado, marcado como ativo/inativo e removido. Dashboards
  antigos, criados antes do construtor (fechamento/orçamento/comissões importados de
  planilha), continuam aparecendo na lista e podem ser abertos normalmente — só não
  têm mais botão de editar, já que esse formato de criação foi substituído pelo
  construtor livre.
- **Apresentar ao cliente**: cada dashboard salvo ganha uma página própria em
  `admin/relatorio.html?id=<id>` (link "Abrir" na lista do cliente) — navegável por
  abas, pronta pra usar numa tela/projeção durante a reunião (ou, no modo de link
  público, o próprio dashboard do Power BI/Looker Studio embutido). Pede login própria
  (mesmo usuário/senha do painel) e tem um link de volta para a pasta do cliente certo.
- Esses dados ficam só no Cloudflare KV (nunca no repositório Git) — por isso nenhum
  cliente ou dashboard real está versionado aqui.

### Usuários com acesso limitado

Além do seu login (usuário/senha configurado como secret do Worker — sempre com
acesso total), a aba **"Usuários"** do painel (`admin/index.html`) permite criar
outros acessos, cada um com uma permissão:

- **Administrador** — acesso total ao painel, igual ao login mestre.
- **Cliente** — só enxerga a pasta de **um** cliente específico
  (`admin/cliente.html?id=<id>`), em modo leitura (sem criar, editar, ativar/desativar
  ou remover dashboards) — útil pra dar acesso só aos dashboards já publicados daquele
  cliente.
- **Dashboard** — só enxerga **um** dashboard específico
  (`admin/relatorio.html?id=<id>`), em modo leitura — útil pra compartilhar o link de
  apresentação de um dashboard só com quem precisa ver aquele, sem dar acesso a mais
  nada.

Essas senhas ficam guardadas no Cloudflare KV com hash (PBKDF2), nunca em texto puro —
diferente do login mestre, que continua sendo um secret do Worker. Criar, editar e
excluir usuários exige estar logado como administrador.

### Diagnóstico Financeiro (captação de leads qualificados)

O botão "Solicitar diagnóstico grátis" (seção Serviços) abre um formulário em modal —
diferente do formulário de contato geral, ele pergunta sobre o negócio do visitante
(ramo, porte, como o financeiro é controlado hoje, maior dificuldade, o que busca
alcançar, urgência) sem pedir nenhum dado sensível. Isso dá à CM um contato bem mais
concreto pra estudar antes da conversa.

- Cada envio é salvo no Cloudflare KV e aparece na aba **"Diagnósticos"** do painel
  (`admin/index.html`), com todos os campos, link direto de e-mail e de WhatsApp pra
  responder rápido. Dá pra marcar como lido/novo e remover.
- Também dispara (opcionalmente) um e-mail de aviso pra `contato@cmfinanceiro.com` via
  Formspree — veja **item 1 abaixo** pra configurar.
- O formulário tem um campo-armadilha (honeypot) invisível contra spam automatizado:
  bots que preenchem todos os campos de um formulário geralmente preenchem esse também,
  e a submissão é descartada (no servidor, mesmo que o JavaScript do navegador seja
  contornado).
- É uma rota pública do Worker (`/api/diagnostico`, só o POST — listar e remover
  continuam exigindo login de administrador), então não depende do admin estar
  logado em lugar nenhum pra funcionar.

## Configurações pendentes (precisam dos seus dados reais)

### 1. Formulário de contato (relatório) e Diagnóstico Financeiro
O formulário geral em `index.html` (`id="formRelatorio"`) está apontando para:
```html
action="https://formspree.io/f/SEU_FORM_ID"
```
Para funcionar de verdade:
1. Crie uma conta gratuita em https://formspree.io
2. Crie um formulário, configure o e-mail de destino como `contato@cmfinanceiro.com`
   e copie o endpoint gerado (`https://formspree.io/f/xxxxxxx`)
3. Substitua `SEU_FORM_ID` pelo ID real em `index.html`

**Diagnóstico Financeiro** (o formulário em modal) usa um endpoint **separado** — crie
um segundo formulário no Formspree (mesmo processo acima, pode ser o mesmo e-mail de
destino) e cole o endpoint na variável de ambiente `FORMSPREE_DIAGNOSTICO_URL` do
Worker no Cloudflare (Settings → Variables → Add variable; não precisa ser "Secret").
Sem essa variável, as respostas continuam sendo salvas e aparecendo no painel — só o
e-mail automático de aviso não é enviado.

Alternativas ao Formspree: Netlify Forms, Google Forms (embutido), ou um backend próprio.

### 2. Links reais da Hotmart
Os infoprodutos pagos em `assets/data/infoprodutos.json` estão com
`https://pay.hotmart.com/SEU-LINK-AQUI` como placeholder. Atualize pelo painel `/admin/`
(ou editando o JSON diretamente) assim que os produtos existirem na Hotmart.

### 3. Dados de contato
Atualize e-mail, WhatsApp, CNPJ e horário de atendimento no rodapé e na seção de contato
de `index.html` (atualmente com valores de exemplo).

### 4. Servidor do painel administrativo
Siga `admin/README-servidor.md` para publicar o Cloudflare Worker que autentica o
painel e guarda os dados (gratuito, ~5 min, sem token nenhum). Sem isso, o painel
fica no ar mas não consegue carregar nem salvar nada.

**Se você já tinha publicado o Worker antes:** toda vez que `admin/worker.js` for
atualizado (o arquivo ganhou rotas e validações novas várias vezes — clientes/
relatórios, usuários, Diagnóstico Financeiro, e agora o construtor de dashboards),
copie o conteúdo novo para o Worker no Cloudflare (Edit code → colar → Save and
Deploy). Nenhuma variável nova é obrigatória — só o `FORMSPREE_DIAGNOSTICO_URL` do
item 1 acima, que é opcional.

### 5. Site público já busca os dados em tempo real
`assets/js/main.js` (constante `ADMIN_API_URL`) já aponta pro Worker publicado — os
Infoprodutos do site mostram direto o que está cadastrado no painel (sem precisar de
novo deploy a cada alteração), com `assets/data/infoprodutos.json` só como reserva
caso o servidor esteja fora do ar. O formulário de Diagnóstico Financeiro depende
dessa mesma conexão pra funcionar.

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
