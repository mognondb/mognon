/**
 * Servidor (Cloudflare Worker) do painel administrativo da CM Soluções Financeiras.
 *
 * Guarda o usuário/senha do admin e o token do GitHub como segredos do lado do
 * servidor (nunca expostos ao navegador) e serve de ponte entre o painel
 * (admin/index.html) e a API do GitHub, para ler/gravar:
 *   - assets/data/infoprodutos.json
 *   - assets/data/dashboards.json
 *
 * Deploy: cole este arquivo no Cloudflare Workers (dash.cloudflare.com) e
 * configure as variáveis de ambiente (como "Secret") abaixo. Veja o passo a
 * passo completo em admin/README-servidor.md.
 *
 * Variáveis de ambiente esperadas (Settings → Variables and Secrets):
 *   ADMIN_USER   usuário de login do painel
 *   ADMIN_PASS   senha de login do painel
 *   GH_TOKEN     fine-grained personal access token do GitHub (Contents: Read and write,
 *                restrito a este repositório)
 *   GH_OWNER     dono do repositório (ex: mognondb)
 *   GH_REPO      nome do repositório (ex: mognon)
 *   GH_BRANCH    branch publicada no GitHub Pages (ex: master)
 *   ALLOWED_ORIGIN  origem do site publicado (ex: https://mognondb.github.io), usada no CORS
 */

const ARQUIVOS = {
  infoprodutos: 'assets/data/infoprodutos.json',
  dashboards: 'assets/data/dashboards.json',
};

function corsHeaders(env) {
  return {
    'Access-Control-Allow-Origin': env.ALLOWED_ORIGIN || '*',
    'Access-Control-Allow-Methods': 'GET, PUT, OPTIONS',
    'Access-Control-Allow-Headers': 'Authorization, Content-Type',
  };
}

function jsonResponse(body, status, env) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...corsHeaders(env) },
  });
}

function autenticado(request, env) {
  const auth = request.headers.get('Authorization') || '';
  if (!auth.startsWith('Basic ')) return false;
  let decodificado;
  try {
    decodificado = atob(auth.slice(6));
  } catch {
    return false;
  }
  const idx = decodificado.indexOf(':');
  if (idx === -1) return false;
  const usuario = decodificado.slice(0, idx);
  const senha = decodificado.slice(idx + 1);
  return usuario === env.ADMIN_USER && senha === env.ADMIN_PASS;
}

function toBase64Utf8(str) {
  const bytes = new TextEncoder().encode(str);
  let binary = '';
  bytes.forEach((b) => { binary += String.fromCharCode(b); });
  return btoa(binary);
}

function fromBase64Utf8(b64) {
  const binary = atob((b64 || '').replace(/\n/g, ''));
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

async function ghGetFile(env, path) {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}?ref=${encodeURIComponent(env.GH_BRANCH)}`;
  const res = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cm-admin-worker',
    },
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Erro ao ler ${path} (HTTP ${res.status})`);
  return { json: JSON.parse(fromBase64Utf8(body.content)), sha: body.sha };
}

async function ghPutFile(env, path, dados, sha) {
  const url = `https://api.github.com/repos/${env.GH_OWNER}/${env.GH_REPO}/contents/${path}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${env.GH_TOKEN}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'cm-admin-worker',
    },
    body: JSON.stringify({
      message: 'Atualiza dados via painel administrativo',
      content: toBase64Utf8(JSON.stringify(dados, null, 2) + '\n'),
      sha,
      branch: env.GH_BRANCH,
    }),
  });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || `Erro ao salvar ${path} (HTTP ${res.status})`);
  return body;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(env) });
    }

    if (url.pathname !== '/api/file') {
      return jsonResponse({ message: 'Não encontrado' }, 404, env);
    }

    if (!autenticado(request, env)) {
      return jsonResponse({ message: 'Usuário ou senha inválidos' }, 401, env);
    }

    const tipo = url.searchParams.get('path');
    const caminhoReal = ARQUIVOS[tipo];
    if (!caminhoReal) {
      return jsonResponse({ message: 'Parâmetro "path" inválido' }, 400, env);
    }

    try {
      if (request.method === 'GET') {
        const { json, sha } = await ghGetFile(env, caminhoReal);
        return jsonResponse({ json, sha }, 200, env);
      }

      if (request.method === 'PUT') {
        const payload = await request.json();
        if (!Array.isArray(payload.data) || !payload.sha) {
          return jsonResponse({ message: 'Corpo inválido: esperado { data, sha }' }, 400, env);
        }
        const resultado = await ghPutFile(env, caminhoReal, payload.data, payload.sha);
        return jsonResponse({ sha: resultado.content.sha }, 200, env);
      }

      return jsonResponse({ message: 'Método não suportado' }, 405, env);
    } catch (err) {
      return jsonResponse({ message: err.message || 'Erro interno' }, 500, env);
    }
  },
};
