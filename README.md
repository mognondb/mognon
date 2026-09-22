# CM Soluções Financeiras — Site

Site estático (HTML/CSS/JS puro) para a CM Soluções Financeiras, publicado via GitHub Pages.

## Estrutura

```
index.html                 Página única com todas as seções
assets/css/style.css        Estilos
assets/js/main.js           Menu mobile, scroll do formulário e envio do relatório
assets/downloads/           Planilhas gratuitas (CSV) disponíveis para download
legacy-jekyll-boilerplate/  Arquivos antigos do scaffold padrão do GitHub Pages (não usados)
.nojekyll                   Desativa o processamento Jekyll para servir os arquivos como estão
```

## Seções da página

1. **Hero** — apresentação rápida da CM.
2. **Sobre** — descrição da empresa.
3. **Produtos** — cards com os serviços de consultoria (cada card leva ao formulário com a área de interesse pré-selecionada).
4. **Infoprodutos** — cards de planilhas (download direto) e e-books/curso (compra).
5. **Contato / Relatório** — formulário para o cliente interessado preencher.

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

### 2. Botões "Comprar agora" dos infoprodutos pagos
Os botões `.btn-comprar` em `index.html` estão com `href="#"` e hoje mostram um alerta
explicativo (ver `assets/js/main.js`). Substitua o `href` de cada botão pelo link real
de checkout da plataforma escolhida (Hotmart, Eduzz, Kiwify, Stripe Payment Link etc.)
e remova o tratamento de clique correspondente em `main.js` quando isso for feito.

### 3. Dados de contato
Atualize e-mail, WhatsApp, CNPJ e horário de atendimento no rodapé e na seção de contato
de `index.html` (atualmente com valores de exemplo).

## Publicação

O site já está pronto para o GitHub Pages: basta habilitar Pages apontando para a branch
publicada, usando a pasta raiz (`/`).
