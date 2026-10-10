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
admin/worker.js             Código do servidor (Cloudflare Worker) usado pelo painel
admin/relatorio.html(.js/.css)  Apresentação de relatórios de fechamento por cliente
admin/README-servidor.md    Passo a passo para publicar o servidor
robots.txt                  Bloqueia indexação de /admin/ por buscadores
legacy-jekyll-boilerplate/  Arquivos antigos do scaffold padrão do GitHub Pages (não usados)
.nojekyll                   Desativa o processamento Jekyll para servir os arquivos como estão
```

## Seções da página

1. **Hero** — apresentação rápida da CM.
2. **Sobre** — quem é a CM e como ela trabalha.
3. **Serviços** — os níveis de apoio (Implantação, Acompanhamento, Assistência, Gestão) e o Diagnóstico Financeiro gratuito.
4. **Portfólio** — dashboards em Power BI, carregados do servidor do painel (ou de
   `assets/data/dashboards.json` como fallback).
5. **Infoprodutos** — planilhas gratuitas e produtos pagos (Hotmart), carregados do
   servidor do painel (ou de `assets/data/infoprodutos.json` como fallback).
6. **Contato / Relatório** — formulário para o cliente interessado preencher.

## Painel administrativo (`/admin/`)

Página **escondida** (não aparece no menu, bloqueada em `robots.txt`) para cadastrar
infoprodutos e dashboards do portfólio **sem editar código**.

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
- **Dashboards**: cada item usa um mini-preview em CSS (barras ou donut) com dados
  fictícios configuráveis — não são capturas de tela reais.

O painel não aparece no menu do site e é bloqueado em `robots.txt`, mas isso é só para
não aparecer em buscas — quem de fato impede alguém de salvar algo é o usuário/senha
verificado pelo servidor.

### Relatórios de fechamento por cliente (apresentação ao vivo)

Uma terceira aba do painel, **"Relatórios de Clientes"**, guarda os fechamentos
mensais (ex.: Instituto Luanda, Setembro/2026) para apresentar ao cliente numa
reunião. Diferente dos infoprodutos/dashboards do portfólio, **esses dados nunca
são públicos**: tanto a leitura quanto a gravação exigem login no servidor.

- **Criar um relatório sem código**: pelo formulário (campos de lista usam uma
  linha por item, colunas separadas por `|`), ou importando uma planilha `.xlsx`
  no modelo próprio — botão **"Baixar modelo"** no painel gera esse arquivo.
  Depois de importar, revise os campos antes de salvar.
- **Apresentar ao cliente**: cada relatório salvo ganha uma página própria em
  `admin/relatorio.html?id=<id>` (link "Abrir" na lista do painel) — um dashboard
  navegável por seções (resumo executivo, indicadores, formação do caixa, receita,
  despesas, produção por profissional, contas, pendências, próximos passos),
  pronta pra usar numa tela/projeção durante a reunião. Pede login própria (mesmo
  usuário/senha do painel).
- Esses dados ficam só no Cloudflare KV (nunca no repositório Git) — por isso
  nenhum relatório real está versionado aqui.

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

### 4. Servidor do painel administrativo
Siga `admin/README-servidor.md` para publicar o Cloudflare Worker que autentica o
painel e guarda os dados (gratuito, ~5 min, sem token nenhum). Sem isso, o painel
fica no ar mas não consegue carregar nem salvar nada.

**Se você já tinha publicado o Worker antes:** o `admin/worker.js` ganhou as rotas de
relatórios (`/api/relatorios`, `/api/relatorio`) — copie o conteúdo atualizado do
arquivo para o Worker no Cloudflare (Edit code → colar → Save and Deploy). Nenhuma
variável nova é necessária, reaproveita `ADMIN_USER`/`ADMIN_PASS`/`CM_DATA`.

### 5. Site público mostrar os dados em tempo real (opcional)
Por padrão o site lê `assets/data/*.json` (arquivos fixos). Depois de publicar o
servidor (item 4), me passe a URL dele que eu configuro `ADMIN_API_URL` em
`assets/js/main.js` para o site buscar os dados mais recentes direto do servidor.

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
