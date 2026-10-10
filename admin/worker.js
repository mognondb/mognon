/**
 * Servidor (Cloudflare Worker) do painel administrativo da CM Soluções Financeiras.
 *
 * Guarda o usuário/senha do admin como segredos do servidor (nunca expostos ao
 * navegador) e guarda os dados de infoprodutos/dashboards num banco de dados
 * Cloudflare KV (sem precisar de token do GitHub nem de nenhuma outra conta).
 *
 * Deploy: cole este arquivo no Cloudflare Workers (dash.cloudflare.com), crie um
 * KV namespace e vincule-o à variável CM_DATA, e configure ADMIN_USER/ADMIN_PASS
 * como secrets. Veja o passo a passo completo em admin/README-servidor.md.
 *
 * Bindings/variáveis esperadas (Settings → Variables and Secrets / Bindings):
 *   CM_DATA      KV namespace (binding) onde os dados ficam guardados
 *   ADMIN_USER   usuário de login do painel (secret)
 *   ADMIN_PASS   senha de login do painel (secret)
 *   ALLOWED_ORIGIN  (opcional) origem do site publicado, usada no CORS. Padrão: "*"
 */

// Conteúdo inicial: usado enquanto o KV ainda não tem nada salvo, para o site
// já funcionar normalmente antes do primeiro cadastro pelo painel.
const PADRAO = {
  infoprodutos: [
    {
      id: 'controle-financeiro-mensal',
      nome: 'Planilha de Controle Financeiro Mensal',
      descricao: 'Organize as receitas e despesas da empresa mês a mês e visualize para onde o dinheiro está indo.',
      icone: '📊',
      tipo: 'gratis',
      precoLabel: 'Grátis',
      link: 'assets/downloads/planilha-controle-financeiro-mensal.csv',
      ativo: true,
    },
    {
      id: 'fluxo-caixa-empresarial',
      nome: 'Planilha de Fluxo de Caixa Empresarial',
      descricao: 'Modelo simples para projetar entradas, saídas e saldo dos próximos meses do seu negócio.',
      icone: '🧾',
      tipo: 'gratis',
      precoLabel: 'Grátis',
      link: 'assets/downloads/planilha-fluxo-caixa-empresarial.csv',
      ativo: true,
    },
    {
      id: 'guia-organizacao-financeira',
      nome: 'E-book: Guia de Organização Financeira para Empresas',
      descricao: 'Um passo a passo completo para estruturar o financeiro do zero, com exercícios práticos.',
      icone: '📘',
      tipo: 'hotmart',
      precoLabel: 'R$ 47',
      link: 'https://pay.hotmart.com/SEU-LINK-AQUI',
      ativo: true,
    },
    {
      id: 'indicadores-financeiros-gestores',
      nome: 'E-book: Indicadores Financeiros para Gestores',
      descricao: 'Os principais indicadores que todo gestor deveria acompanhar para decidir com mais segurança.',
      icone: '🧠',
      tipo: 'hotmart',
      precoLabel: 'R$ 39',
      link: 'https://pay.hotmart.com/SEU-LINK-AQUI',
      ativo: true,
    },
    {
      id: 'curso-fluxo-caixa-gestao',
      nome: 'Curso: Fluxo de Caixa e Gestão Financeira na Prática',
      descricao: 'Curso online para estruturar e acompanhar o financeiro da sua empresa, do zero até a rotina de gestão.',
      icone: '🎥',
      tipo: 'hotmart',
      precoLabel: 'R$ 197',
      link: 'https://pay.hotmart.com/SEU-LINK-AQUI',
      ativo: true,
    },
  ],
  dashboards: [
    {
      id: 'fluxo-de-caixa',
      titulo: 'Fluxo de Caixa',
      descricao: 'Entradas, saídas e saldo projetado mês a mês, com alertas de fluxo negativo.',
      preview: 'barras',
      kpis: [{ valor: 'R$ 128k', label: 'Receita' }, { valor: '32%', label: 'Margem' }],
      barras: [35, 55, 45, 70, 60, 85],
      ativo: true,
    },
    {
      id: 'despesas-por-categoria',
      titulo: 'Despesas por Categoria',
      descricao: 'Distribuição de gastos fixos, variáveis e extras, com comparação mensal.',
      preview: 'donut',
      donut: { p1: 41, p2: 68 },
      legendas: ['Fixos', 'Variáveis', 'Outros'],
      ativo: true,
    },
    {
      id: 'indicadores-investimentos',
      titulo: 'Indicadores de Investimentos',
      descricao: 'Evolução da carteira, rentabilidade e diversificação por classe de ativo.',
      preview: 'barras',
      kpis: [{ valor: '18,3%', label: 'Rentab.' }, { valor: 'R$ 42k', label: 'Aportes' }],
      barras: [25, 40, 38, 58, 72, 90],
      ativo: true,
    },
    {
      id: 'indicadores-comerciais',
      titulo: 'Indicadores Comerciais',
      descricao: 'Metas de vendas, ticket médio e desempenho por período ou equipe.',
      preview: 'donut',
      donut: { p1: 55, p2: 80 },
      legendas: ['Meta atingida', 'Em andamento', 'Não iniciado'],
      ativo: true,
    },
  ],
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function slugify(str) {
  return (str || '')
    .toString()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

// ---------- Usuários, senhas e permissões ----------
//
// Além do usuário/senha "mestre" (ADMIN_USER/ADMIN_PASS, guardado como secret do
// Worker), o painel permite ao admin criar outros usuários, guardados no KV com a
// senha derivada por PBKDF2 (nunca em texto puro). Cada usuário tem um "papel":
//   admin      acesso total, inclusive para gerenciar outros usuários
//   cliente    só enxerga a pasta de UM cliente (clienteId), em modo leitura
//   dashboard  só enxerga UM relatório específico (relatorioId), em modo leitura
const PAPEIS_VALIDOS = ['admin', 'cliente', 'dashboard'];

function bytesToHex(bytes) {
  return [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function hexToBytes(hex) {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
  return out;
}
function gerarSaltHex() {
  return bytesToHex(crypto.getRandomValues(new Uint8Array(16)));
}
async function hashSenha(senha, saltHex) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey('raw', enc.encode(senha), { name: 'PBKDF2' }, false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: hexToBytes(saltHex), iterations: 100000, hash: 'SHA-256' },
    keyMaterial,
    256,
  );
  return bytesToHex(new Uint8Array(bits));
}

function decodificarBasicAuth(request) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return null;
  let decodificado;
  try {
    decodificado = atob(auth.slice(6));
  } catch {
    return null;
  }
  const idx = decodificado.indexOf(':');
  if (idx === -1) return null;
  return { usuario: decodificado.slice(0, idx), senha: decodificado.slice(idx + 1) };
}

// Verifica usuário/senha e devolve a sessão (papel + escopo) ou null.
async function autenticarSessao(request, env) {
  const credenciais = decodificarBasicAuth(request);
  if (!credenciais) return null;
  const { usuario, senha } = credenciais;

  if (usuario === env.ADMIN_USER && senha === env.ADMIN_PASS) {
    return { username: usuario, nome: 'Administrador', papel: 'admin' };
  }

  const registro = await env.CM_DATA.get(`usuario_${usuario}`, 'json');
  if (!registro || registro.ativo === false) return null;
  const hash = await hashSenha(senha, registro.saltHex);
  if (hash !== registro.hashHex) return null;
  return {
    username: registro.username,
    nome: registro.nome,
    papel: registro.papel,
    clienteId: registro.clienteId || null,
    relatorioId: registro.relatorioId || null,
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    // Usado só pela tela de login do painel para validar usuário/senha.
    if (url.pathname === '/api/login') {
      const sessao = await autenticarSessao(request, env);
      return sessao
        ? jsonResponse({ ok: true, papel: sessao.papel, nome: sessao.nome, clienteId: sessao.clienteId, relatorioId: sessao.relatorioId }, 200, env)
        : jsonResponse({ message: 'Usuário ou senha inválidos' }, 401, env);
    }

    // Clientes, relatórios/dashboards de apresentação e usuários do painel: sempre
    // exigem login, tanto pra ler quanto pra gravar — são dados financeiros
    // sensíveis de clientes, diferente dos infoprodutos/dashboards do portfólio
    // (que são públicos).
    const rotasProtegidas = ['/api/clientes', '/api/cliente', '/api/relatorios', '/api/relatorio', '/api/usuarios', '/api/usuario'];
    if (rotasProtegidas.includes(url.pathname)) {
      const sessao = await autenticarSessao(request, env);
      if (!sessao) {
        return jsonResponse({ message: 'Usuário ou senha inválidos' }, 401, env);
      }

      // ---- Usuários do painel (só admin) ----

      if (url.pathname === '/api/usuarios' || url.pathname === '/api/usuario') {
        if (sessao.papel !== 'admin') return jsonResponse({ message: 'Acesso negado' }, 403, env);

        if (url.pathname === '/api/usuarios') {
          if (request.method !== 'GET') return jsonResponse({ message: 'Método não suportado' }, 405, env);
          const indice = (await env.CM_DATA.get('usuarios_index', 'json')) || [];
          return jsonResponse(indice, 200, env);
        }

        // /api/usuario
        const usernameParam = url.searchParams.get('username');

        if (request.method === 'DELETE') {
          if (!usernameParam) return jsonResponse({ message: 'Parâmetro "username" obrigatório' }, 400, env);
          await env.CM_DATA.delete(`usuario_${usernameParam}`);
          const indiceUsuarios = ((await env.CM_DATA.get('usuarios_index', 'json')) || []).filter((u) => u.username !== usernameParam);
          await env.CM_DATA.put('usuarios_index', JSON.stringify(indiceUsuarios));
          return jsonResponse({ ok: true }, 200, env);
        }

        if (request.method === 'PUT') {
          let dados;
          try {
            dados = await request.json();
          } catch {
            return jsonResponse({ message: 'JSON inválido' }, 400, env);
          }
          const username = (dados.username || '').trim();
          if (!username) return jsonResponse({ message: 'Informe o nome de usuário' }, 400, env);
          if (username === env.ADMIN_USER) return jsonResponse({ message: 'Esse nome de usuário já é o do administrador mestre' }, 400, env);
          if (!PAPEIS_VALIDOS.includes(dados.papel)) return jsonResponse({ message: 'Papel inválido' }, 400, env);
          if (dados.papel === 'cliente' && !dados.clienteId) return jsonResponse({ message: 'Informe o cliente para o papel "cliente"' }, 400, env);
          if (dados.papel === 'dashboard' && !dados.relatorioId) return jsonResponse({ message: 'Informe o relatório para o papel "dashboard"' }, 400, env);

          const existente = await env.CM_DATA.get(`usuario_${username}`, 'json');
          if (!existente && !dados.senha) return jsonResponse({ message: 'Informe uma senha para o novo usuário' }, 400, env);

          const saltHex = existente && !dados.senha ? existente.saltHex : gerarSaltHex();
          const hashHex = dados.senha ? await hashSenha(dados.senha, saltHex) : existente.hashHex;

          const registro = {
            username,
            nome: dados.nome || username,
            papel: dados.papel,
            clienteId: dados.papel === 'cliente' ? dados.clienteId : null,
            relatorioId: dados.papel === 'dashboard' ? dados.relatorioId : null,
            ativo: dados.ativo !== false,
            saltHex,
            hashHex,
            criadoEm: existente?.criadoEm || new Date().toISOString(),
            atualizadoEm: new Date().toISOString(),
          };
          await env.CM_DATA.put(`usuario_${username}`, JSON.stringify(registro));

          const indiceUsuarios = (await env.CM_DATA.get('usuarios_index', 'json')) || [];
          const resumo = { username, nome: registro.nome, papel: registro.papel, clienteId: registro.clienteId, relatorioId: registro.relatorioId, ativo: registro.ativo, criadoEm: registro.criadoEm };
          const posicaoUsuario = indiceUsuarios.findIndex((u) => u.username === username);
          if (posicaoUsuario >= 0) indiceUsuarios[posicaoUsuario] = resumo; else indiceUsuarios.push(resumo);
          await env.CM_DATA.put('usuarios_index', JSON.stringify(indiceUsuarios));

          return jsonResponse(resumo, 200, env);
        }

        return jsonResponse({ message: 'Método não suportado' }, 405, env);
      }

      // ---- Clientes ----

      if (url.pathname === '/api/clientes') {
        if (request.method !== 'GET') return jsonResponse({ message: 'Método não suportado' }, 405, env);
        if (sessao.papel === 'dashboard') return jsonResponse({ message: 'Acesso negado' }, 403, env);
        let indice = (await env.CM_DATA.get('clientes_index', 'json')) || [];
        if (sessao.papel === 'cliente') indice = indice.filter((c) => c.id === sessao.clienteId);
        return jsonResponse(indice, 200, env);
      }

      if (url.pathname === '/api/cliente') {
        const id = url.searchParams.get('id');
        if (sessao.papel === 'dashboard') return jsonResponse({ message: 'Acesso negado' }, 403, env);
        if (sessao.papel === 'cliente' && (request.method !== 'GET' || id !== sessao.clienteId)) {
          return jsonResponse({ message: 'Acesso negado' }, 403, env);
        }

        if (request.method === 'GET') {
          if (!id) return jsonResponse({ message: 'Parâmetro "id" obrigatório' }, 400, env);
          const cliente = await env.CM_DATA.get(`cliente_${id}`, 'json');
          if (!cliente) return jsonResponse({ message: 'Cliente não encontrado' }, 404, env);
          return jsonResponse(cliente, 200, env);
        }

        if (request.method === 'PUT') {
          let cliente;
          try {
            cliente = await request.json();
          } catch {
            return jsonResponse({ message: 'JSON inválido' }, 400, env);
          }
          if (!cliente.nome) return jsonResponse({ message: 'Informe o nome do cliente' }, 400, env);
          const idFinal = cliente.id || slugify(cliente.nome);
          cliente.id = idFinal;
          cliente.atualizadoEm = new Date().toISOString();
          if (!cliente.criadoEm) cliente.criadoEm = cliente.atualizadoEm;

          await env.CM_DATA.put(`cliente_${idFinal}`, JSON.stringify(cliente));

          const indiceClientes = (await env.CM_DATA.get('clientes_index', 'json')) || [];
          const relatoriosDoCliente = ((await env.CM_DATA.get('relatorios_index', 'json')) || [])
            .filter((r) => r.clienteId === idFinal);
          const resumo = { id: idFinal, nome: cliente.nome, qtdRelatorios: relatoriosDoCliente.length, atualizadoEm: cliente.atualizadoEm };
          const posicao = indiceClientes.findIndex((c) => c.id === idFinal);
          if (posicao >= 0) indiceClientes[posicao] = resumo; else indiceClientes.push(resumo);
          await env.CM_DATA.put('clientes_index', JSON.stringify(indiceClientes));

          return jsonResponse(cliente, 200, env);
        }

        if (request.method === 'DELETE') {
          if (!id) return jsonResponse({ message: 'Parâmetro "id" obrigatório' }, 400, env);
          await env.CM_DATA.delete(`cliente_${id}`);
          const indiceClientes = ((await env.CM_DATA.get('clientes_index', 'json')) || []).filter((c) => c.id !== id);
          await env.CM_DATA.put('clientes_index', JSON.stringify(indiceClientes));

          // Remove também os relatórios desse cliente.
          const indiceRelatorios = (await env.CM_DATA.get('relatorios_index', 'json')) || [];
          const doCliente = indiceRelatorios.filter((r) => r.clienteId === id);
          for (const r of doCliente) await env.CM_DATA.delete(`relatorio_${r.id}`);
          const indiceRestante = indiceRelatorios.filter((r) => r.clienteId !== id);
          await env.CM_DATA.put('relatorios_index', JSON.stringify(indiceRestante));

          return jsonResponse({ ok: true }, 200, env);
        }

        return jsonResponse({ message: 'Método não suportado' }, 405, env);
      }

      // ---- Relatórios (sempre pertencem a um cliente) ----

      // Lista resumida — opcionalmente filtrada por cliente — para as telas de listagem.
      if (url.pathname === '/api/relatorios') {
        if (request.method !== 'GET') return jsonResponse({ message: 'Método não suportado' }, 405, env);
        if (sessao.papel === 'dashboard') return jsonResponse({ message: 'Acesso negado' }, 403, env);
        const tipo = url.searchParams.get('tipo');
        let indice = (await env.CM_DATA.get('relatorios_index', 'json')) || [];
        if (sessao.papel === 'cliente') {
          indice = indice.filter((r) => r.clienteId === sessao.clienteId && r.ativo !== false);
        } else {
          const clienteId = url.searchParams.get('clienteId');
          if (clienteId) indice = indice.filter((r) => r.clienteId === clienteId);
        }
        if (tipo) indice = indice.filter((r) => r.tipo === tipo);
        return jsonResponse(indice, 200, env);
      }

      // Um relatório específico: obter, salvar (criar/editar) ou excluir.
      const id = url.searchParams.get('id');

      if (sessao.papel === 'dashboard' && (request.method !== 'GET' || id !== sessao.relatorioId)) {
        return jsonResponse({ message: 'Acesso negado' }, 403, env);
      }
      if (sessao.papel === 'cliente' && request.method !== 'GET') {
        return jsonResponse({ message: 'Acesso negado' }, 403, env);
      }

      if (request.method === 'GET') {
        if (!id) return jsonResponse({ message: 'Parâmetro "id" obrigatório' }, 400, env);
        const relatorio = await env.CM_DATA.get(`relatorio_${id}`, 'json');
        if (!relatorio) return jsonResponse({ message: 'Relatório não encontrado' }, 404, env);
        if (sessao.papel === 'cliente' && (relatorio.clienteId !== sessao.clienteId || relatorio.ativo === false)) {
          return jsonResponse({ message: 'Relatório não encontrado' }, 404, env);
        }
        return jsonResponse(relatorio, 200, env);
      }

      if (request.method === 'PUT') {
        let relatorio;
        try {
          relatorio = await request.json();
        } catch {
          return jsonResponse({ message: 'JSON inválido' }, 400, env);
        }
        const tiposValidos = ['fechamento', 'orcamento', 'comissoes'];
        if (!relatorio.clienteId || !relatorio.periodo || !tiposValidos.includes(relatorio.tipo)) {
          return jsonResponse({ message: 'Informe o cliente, o período e um tipo válido (fechamento, orcamento ou comissoes)' }, 400, env);
        }
        if (relatorio.modo === 'embed' && !relatorio.embedUrl) {
          return jsonResponse({ message: 'Informe o link do dashboard (Power BI / Looker Studio)' }, 400, env);
        }
        const idFinal = relatorio.id || slugify(`${relatorio.clienteId}-${relatorio.tipo}-${relatorio.periodo}`);
        relatorio.id = idFinal;
        if (relatorio.ativo == null) relatorio.ativo = true;
        if (!relatorio.modo) relatorio.modo = 'importado';
        relatorio.atualizadoEm = new Date().toISOString();

        await env.CM_DATA.put(`relatorio_${idFinal}`, JSON.stringify(relatorio));

        const indice = (await env.CM_DATA.get('relatorios_index', 'json')) || [];
        const resumo = {
          id: idFinal,
          clienteId: relatorio.clienteId,
          cliente: relatorio.cliente,
          tipo: relatorio.tipo,
          modo: relatorio.modo,
          periodo: relatorio.periodo,
          ativo: relatorio.ativo,
          atualizadoEm: relatorio.atualizadoEm,
        };
        const posicao = indice.findIndex((r) => r.id === idFinal);
        if (posicao >= 0) indice[posicao] = resumo; else indice.push(resumo);
        await env.CM_DATA.put('relatorios_index', JSON.stringify(indice));

        // Atualiza a contagem de relatórios no índice de clientes.
        const indiceClientes = (await env.CM_DATA.get('clientes_index', 'json')) || [];
        const posicaoCliente = indiceClientes.findIndex((c) => c.id === relatorio.clienteId);
        if (posicaoCliente >= 0) {
          indiceClientes[posicaoCliente].qtdRelatorios = indice.filter((r) => r.clienteId === relatorio.clienteId).length;
          await env.CM_DATA.put('clientes_index', JSON.stringify(indiceClientes));
        }

        return jsonResponse(relatorio, 200, env);
      }

      if (request.method === 'DELETE') {
        if (!id) return jsonResponse({ message: 'Parâmetro "id" obrigatório' }, 400, env);
        const existente = await env.CM_DATA.get(`relatorio_${id}`, 'json');
        await env.CM_DATA.delete(`relatorio_${id}`);
        const indice = ((await env.CM_DATA.get('relatorios_index', 'json')) || []).filter((r) => r.id !== id);
        await env.CM_DATA.put('relatorios_index', JSON.stringify(indice));

        if (existente?.clienteId) {
          const indiceClientes = (await env.CM_DATA.get('clientes_index', 'json')) || [];
          const posicaoCliente = indiceClientes.findIndex((c) => c.id === existente.clienteId);
          if (posicaoCliente >= 0) {
            indiceClientes[posicaoCliente].qtdRelatorios = indice.filter((r) => r.clienteId === existente.clienteId).length;
            await env.CM_DATA.put('clientes_index', JSON.stringify(indiceClientes));
          }
        }

        return jsonResponse({ ok: true }, 200, env);
      }

      return jsonResponse({ message: 'Método não suportado' }, 405, env);
    }

    if (url.pathname !== '/api/file') {
      return jsonResponse({ message: 'Não encontrado' }, 404, env);
    }

    const tipo = url.searchParams.get('path');
    if (tipo !== 'infoprodutos' && tipo !== 'dashboards') {
      return jsonResponse({ message: 'Parâmetro "path" inválido' }, 400, env);
    }

    // Leitura é pública: é o que o site publicado usa para montar as seções.
    if (request.method === 'GET') {
      const salvo = await env.CM_DATA.get(tipo, 'json');
      return jsonResponse(salvo ?? PADRAO[tipo], 200, env);
    }

    // Gravação exige login de administrador.
    if (request.method === 'PUT') {
      const sessaoArquivo = await autenticarSessao(request, env);
      if (!sessaoArquivo || sessaoArquivo.papel !== 'admin') {
        return jsonResponse({ message: 'Usuário ou senha inválidos' }, 401, env);
      }
      let payload;
      try {
        payload = await request.json();
      } catch {
        return jsonResponse({ message: 'JSON inválido' }, 400, env);
      }
      if (!Array.isArray(payload)) {
        return jsonResponse({ message: 'Corpo inválido: esperada uma lista de itens' }, 400, env);
      }
      await env.CM_DATA.put(tipo, JSON.stringify(payload));
      return jsonResponse({ ok: true }, 200, env);
    }

    return jsonResponse({ message: 'Método não suportado' }, 405, env);
  },
};
