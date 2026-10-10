# CM Soluções Financeiras — Site

Site estático (HTML/CSS/JS puro) para a CM Soluções Financeiras, publicado via GitHub Pages.

## Estrutura

```
index.html                 Página única com todas as seções
assets/css/style.css        Estilos
assets/js/main.js           Menu mobile, formulário de contato e renderização dinâmica
assets/data/infoprodutos.json  Dados dos infoprodutos (cadastrados via /admin/)
assets/data/dashboards.json    Dados do portfólio de dashboards (cadastrados via /admin/)
assets/downloads/           Planilhas gratuitas (CSV) disponíveis para download
assets/img/                 Logo e imagens
admin/                      Painel administrativo (escondido, não linkado no site)
robots.txt                  Bloqueia indexação de /admin/ por buscadores
legacy-jekyll-boilerplate/  Arquivos antigos do scaffold padrão do GitHub Pages (não usados)
.nojekyll                   Desativa o processamento Jekyll para servir os arquivos como estão
```

## Seções da página

1. **Hero** — apresentação rápida da CM.
2. **Sobre** — quem é a CM e como ela trabalha.
3. **Serviços** — os níveis de apoio (Implantação, Acompanhamento, Assistência, Gestão) e o Diagnóstico Financeiro gratuito.
4. **Portfólio** — dashboards em Power BI, carregados de `assets/data/dashboards.json`.
5. **Infoprodutos** — planilhas gratuitas e produtos pagos (Hotmart), carregados de `assets/data/infoprodutos.json`.
6. **Contato / Relatório** — formulário para o cliente interessado preencher.

## Painel administrativo (`/admin/`)

Página **escondida** (não aparece no menu, bloqueada em `robots.txt`) para cadastrar
infoprodutos e dashboards do portfólio **sem editar código**.

- Acesse `seusite.com/admin/`
- Login do dia a dia: **usuário e senha** (configurados em `admin/admin.js`, como hash,
  não em texto puro).
- **Primeiro acesso nesse navegador**: além de usuário/senha, é preciso colar um
  **token de acesso do GitHub** (fine-grained personal access token, com permissão
  apenas de leitura/escrita de conteúdo neste repositório). O passo a passo para gerar
  o token está dentro da própria tela de login. Esse token fica salvo só naquele
  navegador (localStorage) e não precisa ser digitado de novo nos próximos acessos —
  só usuário e senha.
- **Importante sobre segurança**: como este é um site estático (sem servidor próprio),
  não existe autenticação realmente segura possível no navegador — qualquer pessoa com
  conhecimento técnico consegue ler o `admin.js` publicado. A senha fica como hash
  (não em texto puro) só para não aparecer "a olho nu" no código-fonte, mas isso não
  impede um ataque deliberado. Quem de fato autoriza qualquer gravação no repositório é
  o token do GitHub, que cada pessoa configura no próprio navegador e nunca fica
  embutido no código. Por isso o painel também não está linkado em lugar nenhum do site
  e é bloqueado em `robots.txt`. Para trocar a senha, gere um novo hash SHA-256 de
  `usuario:senha` e substitua a constante `CREDENCIAIS_HASH` em `admin/admin.js`.
- Cada "Salvar alterações" cria um commit direto nos arquivos `assets/data/*.json` do
  branch configurado (padrão: `master`) — o GitHub Pages republica o site automaticamente
  em seguida.
- **Infoprodutos grátis**: o campo "link" deve apontar para um arquivo já existente em
  `assets/downloads/`. Para adicionar um arquivo novo, é preciso subir ele no repositório
  (o painel ainda não faz upload de arquivo).
- **Infoprodutos pagos**: o campo "link" é a URL de checkout da Hotmart
  (ex: `https://pay.hotmart.com/XXXXXXX`).
- **Dashboards**: cada item usa um mini-preview em CSS (barras ou donut) com dados
  fictícios configuráveis — não são capturas de tela reais.

> Importante: "escondida" aqui significa não-indexada e não-linkada, não autenticação
> forte. Quem tiver a URL consegue ver a tela de login, mas só consegue salvar algo se
> tiver um token válido com permissão no repositório.

## Configurações pendentes (precisam dos seus dados reais)

### 1. Formulário de contato (relatório)
O formulário em `index.html` (`id="formRelatorio"`) está apontando para:
```html
action="https://formspree.io/f/SEU_FORM_ID"
```
Para funcionar de verdade:
1. Crie uma conta gratuita em https://formspree.io
2. Crie um formulário e copie o ID gerado
3. Substitua `SEU_FORM_ID` pelo ID real

Alternativas ao Formspree: Netlify Forms, Google Forms (embutido), ou um backend próprio.

### 2. Links reais da Hotmart
Os infoprodutos pagos em `assets/data/infoprodutos.json` estão com
`https://pay.hotmart.com/SEU-LINK-AQUI` como placeholder. Atualize pelo painel `/admin/`
(ou editando o JSON diretamente) assim que os produtos existirem na Hotmart.

### 3. Dados de contato
Atualize e-mail, WhatsApp, CNPJ e horário de atendimento no rodapé e na seção de contato
de `index.html` (atualmente com valores de exemplo).

### 4. Branch do GitHub Pages
O painel `/admin/` assume por padrão que o GitHub Pages publica a branch `master`. Se o
Pages deste repositório estiver configurado para outra branch, ajuste o campo "Branch
publicado no GitHub Pages" na tela de login do admin (fica salvo no navegador).

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
