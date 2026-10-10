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
admin/README-servidor.md    Passo a passo para publicar o servidor
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
- Login: **usuário e senha**, verificados por um servidor próprio (Cloudflare Worker,
  gratuito) — veja **`admin/README-servidor.md`** para o passo a passo de publicá-lo
  (uma vez só, leva uns 10 minutos).
- O servidor guarda o usuário/senha e o token do GitHub como segredos — nenhum dos
  dois fica no código do site. O navegador só envia usuário/senha a cada chamada; é o
  servidor quem decide se autoriza e fala com a API do GitHub.
- Depois de configurado, o navegador lembra o endereço do servidor; o login do dia a
  dia é só usuário e senha.
- Cada "Salvar alterações" faz o servidor commitar direto nos arquivos
  `assets/data/*.json` do branch configurado — o GitHub Pages republica o site
  automaticamente em seguida.
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
painel e fala com a API do GitHub. Sem isso, o painel fica no ar mas não consegue
carregar nem salvar nada.

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
