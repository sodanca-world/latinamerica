import fs from 'node:fs';
import path from 'node:path';

const WP_API_BASE = 'https://latinamerica.sodanca.world/wp-json/wp/v2';
const PUBLIC_UPLOADS_DIR = path.resolve('public/uploads');
const CONTENT_DIR = path.resolve('src/content');

// Helper para garantir que diretórios existem
function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

// Helper para fazer download de imagem
async function downloadImage(url, destPath) {
  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Status ${res.status}`);
    const buffer = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(destPath, buffer);
    console.log(`[Imagens] Download concluído: ${path.basename(destPath)}`);
    return true;
  } catch (error) {
    console.error(`[Imagens] Erro ao baixar imagem ${url}:`, error.message);
    return false;
  }
}

async function run() {
  console.log('=== Iniciando Importação de Dados do WordPress ===');
  ensureDirectoryExists(PUBLIC_UPLOADS_DIR);
  ensureDirectoryExists(CONTENT_DIR);

  try {
    // 1. Buscar Países
    console.log('[API] Buscando países...');
    const paisesRes = await fetch(`${WP_API_BASE}/pais?per_page=100`);
    if (!paisesRes.ok) throw new Error(`Erro ao buscar países: ${paisesRes.status}`);
    const wpPaises = await paisesRes.json();

    const paises = wpPaises.map(p => ({
      id: p.id,
      Nome: p.name,
      Slug: p.slug
    }));

    // Mapeamento rápido de ID do País para Slug para ajudar no mapeamento das lojas
    const paisIdToSlug = {};
    paises.forEach(p => {
      paisIdToSlug[p.id] = p.Slug;
    });

    console.log(`[API] ${paises.length} países encontrados.`);

    // 2. Buscar Mídias (Imagens)
    console.log('[API] Buscando mídias...');
    const mediaRes = await fetch(`${WP_API_BASE}/media?per_page=100`);
    if (!mediaRes.ok) throw new Error(`Erro ao buscar mídias: ${mediaRes.status}`);
    const wpMedia = await mediaRes.json();

    const mediaMap = {};
    console.log(`[API] ${wpMedia.length} mídias encontradas. Iniciando downloads...`);

    for (const m of wpMedia) {
      const sourceUrl = m.source_url;
      if (!sourceUrl) continue;

      const ext = path.extname(new URL(sourceUrl).pathname) || '.jpg';
      const fileName = `media-${m.id}${ext}`;
      const localPath = path.join(PUBLIC_UPLOADS_DIR, fileName);

      // Baixar imagem se não existir localmente
      if (!fs.existsSync(localPath)) {
        await downloadImage(sourceUrl, localPath);
      } else {
        console.log(`[Imagens] Imagem já existe localmente: ${fileName}`);
      }

      mediaMap[m.id] = `/uploads/${fileName}`;
    }

    // 3. Buscar Lojas (Clientes)
    console.log('[API] Buscando lojas (clientes)...');
    const clientesRes = await fetch(`${WP_API_BASE}/cliente?per_page=100`);
    if (!clientesRes.ok) throw new Error(`Erro ao buscar clientes: ${clientesRes.status}`);
    const wpClientes = await clientesRes.json();

    console.log(`[API] ${wpClientes.length} lojas encontradas. Mapeando dados...`);

    const lojas = wpClientes.map(c => {
      const metadata = c.meta_box || {};
      
      // Mapear IDs de países no WordPress para os Slugs dos países correspondentes
      const paisIds = c.pais || [];
      const paisSlugs = paisIds
        .map(id => paisIdToSlug[id])
        .filter(Boolean);

      // Caso a loja não tenha país associado no WordPress (mas tenha no slug da class_list ou algo assim)
      if (paisSlugs.length === 0) {
        // Fallback: tentar decodificar a partir da classe CSS do WordPress na resposta
        const paisClass = c.class_list?.find(cls => cls.startsWith('pais-'));
        if (paisClass) {
          const fallbackSlug = paisClass.replace('pais-', '');
          paisSlugs.push(fallbackSlug);
        }
      }

      // Logotipo/Imagem da loja
      const logoId = c.featured_media;
      const logoUrl = mediaMap[logoId] || null;
      const logo = logoUrl ? [{ url: logoUrl }] : undefined;

      return {
        id: String(c.id),
        Nome: c.title?.rendered || 'Só Dança',
        Slug: c.slug,
        Pais: paisSlugs, // Array de strings (slugs do país), similar a Cidade em fr/lojas.json
        Endereco: metadata.endereo || undefined,
        LinkMaps: metadata.url_maps_google || undefined,
        Telefone: metadata.telefone || undefined,
        Email: metadata['e-mail'] || undefined,
        Website: metadata.website || undefined,
        Logo: logo
      };
    });

    // 4. Salvar Arquivos JSON
    console.log('[Salvar] Salvando arquivos de coleção...');
    fs.writeFileSync(
      path.join(CONTENT_DIR, 'paises.json'),
      JSON.stringify(paises, null, 2),
      'utf-8'
    );
    console.log('[Salvar] paises.json gravado.');

    fs.writeFileSync(
      path.join(CONTENT_DIR, 'lojas.json'),
      JSON.stringify(lojas, null, 2),
      'utf-8'
    );
    console.log('[Salvar] lojas.json gravado.');
    console.log('=== Importação concluída com sucesso! ===');

  } catch (error) {
    console.error('!!! Falha crítica durante a importação de dados:', error);
    process.exit(1);
  }
}

run();
