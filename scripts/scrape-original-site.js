import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import xlsx from 'xlsx';

const BASE_URL = 'https://latinamerica.sodanca.world';
const OUTPUT_EXCEL = path.resolve(process.cwd(), 'sodanca-latinamerica-import.xlsx');
const UPLOADS_DIR = path.resolve(process.cwd(), 'public/uploads');

if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// Função para decodificar email do Cloudflare
function decodeCfEmail(encodedString) {
  if (!encodedString) return '';
  try {
    let email = '';
    const r = parseInt(encodedString.substring(0, 2), 16);
    for (let n = 2; n < encodedString.length; n += 2) {
      const c = parseInt(encodedString.substring(n, n + 2), 16) ^ r;
      email += String.fromCharCode(c);
    }
    return email;
  } catch (err) {
    console.error('Erro ao decodificar email:', err);
    return '';
  }
}

// Função para gerar slug único e amigável
function generateSlug(text) {
  return text
    .toString()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove acentos
    .replace(/[^a-z0-9\s-]/g, '')   // remove caracteres especiais
    .replace(/\s+/g, '-')           // substitui espaços por -
    .replace(/-+/g, '-')            // remove hifens repetidos
    .trim();
}

// Baixar imagens de logo
async function downloadLogo(url) {
  if (!url) return '';
  try {
    // Pegar o nome do arquivo na URL
    const parsedUrl = new URL(url);
    const fileName = path.basename(parsedUrl.pathname);
    const destPath = path.join(UPLOADS_DIR, fileName);

    // Se já existe localmente, não precisamos baixar de novo
    if (fs.existsSync(destPath)) {
      return fileName;
    }

    console.log(`Baixando logo: ${url} -> ${fileName}`);
    const res = await fetch(url);
    if (!res.ok) {
      throw new Error(`Erro HTTP: ${res.status}`);
    }
    const buffer = await res.arrayBuffer();
    fs.writeFileSync(destPath, Buffer.from(buffer));
    return fileName;
  } catch (error) {
    console.error(`Erro ao baixar a logo do link ${url}:`, error.message);
    return '';
  }
}

async function startScrape() {
  console.log('=== Iniciando Scraping do Site Original ===');
  console.log(`URL de Origem: ${BASE_URL}\n`);

  const paises = [];
  const lojas = [];
  const slugsLojasCriadas = new Set();

  try {
    // 1. Obter a lista de países a partir do menu da Home
    console.log('Obtendo lista de países do menu principal...');
    const homeRes = await fetch(BASE_URL);
    if (!homeRes.ok) {
      throw new Error(`Não foi possível carregar a página inicial: ${homeRes.status}`);
    }
    const homeHtml = await homeRes.text();
    const $home = cheerio.load(homeHtml);

    // Procurar links de países no menu ou na página
    const linksPaises = [];
    $home('a[href*="/pais/"]').each((_, el) => {
      const href = $home(el).attr('href');
      const text = $home(el).text().trim();
      if (href && text && !text.toLowerCase().includes('feed')) {
        // Extrair slug da URL, ex: https://latinamerica.sodanca.world/pais/argentina/ -> argentina
        const cleanUrl = href.replace(/\/$/, ''); // Remove barra no final
        const slug = cleanUrl.split('/').pop();
        
        if (slug && !linksPaises.some(p => p.slug === slug)) {
          linksPaises.push({
            nome: text,
            slug: slug,
            url: href
          });
        }
      }
    });

    console.log(`Encontrados ${linksPaises.length} países no menu.`);

    // 2. Iterar por cada país e raspar as lojas correspondentes
    let ordemPais = 1;
    for (const paisObj of linksPaises) {
      console.log(`\nProcessando país: ${paisObj.nome.toUpperCase()} (${paisObj.url})`);
      
      paises.push({
        Nome: paisObj.nome,
        Slug: paisObj.slug,
        Ordem: ordemPais++
      });

      const paisRes = await fetch(paisObj.url);
      if (!paisRes.ok) {
        console.error(`Erro ao carregar página do país ${paisObj.nome}: ${paisRes.status}`);
        continue;
      }
      const paisHtml = await paisRes.text();
      const $pais = cheerio.load(paisHtml);

      // Cada loja está estruturada dentro de cartões de Flipbox do Oxygen Builder (.oxel_flipbox)
      const flipboxes = $pais('.oxel_flipbox');
      console.log(`Encontradas ${flipboxes.length} lojas em ${paisObj.nome}`);

      for (let i = 0; i < flipboxes.length; i++) {
        const el = flipboxes[i];
        const $el = $pais(el);

        const front = $el.find('.oxel_flipbox__front');
        const back = $el.find('.oxel_flipbox__back');

        // Frente do cartão
        const nomeLoja = front.find('h2.ct-headline').text().trim();
        const cidadeLoja = front.find('.ct-text-block').text().trim();
        const rawLogoUrl = front.find('img').attr('src');

        if (!nomeLoja) {
          console.warn('Loja sem nome encontrada na frente do cartão, pulando...');
          continue;
        }

        // Tratar o logotipo da loja
        let logoArquivo = '';
        if (rawLogoUrl) {
          logoArquivo = await downloadLogo(rawLogoUrl);
        }

        // Verso do cartão (informações de contato)
        let endereco = '';
        let linkMaps = '';
        let telefone = '';
        let email = '';
        let instagram = '';
        let facebook = '';
        let website = '';

        // Procurar links no verso
        back.find('a').each((_, aEl) => {
          const $a = $pais(aEl);
          const href = $a.attr('href') || '';
          const text = $a.text().trim();

          // 1. Verificar Google Maps (endereço)
          if (href.includes('google.com/maps') || href.includes('maps.google') || href.includes('place/')) {
            linkMaps = href;
            // Geralmente o endereço está dentro do span do endereço
            const endText = $a.find('.text-end-ville').text().trim() || $a.text().trim();
            if (endText && endText !== 'Google Maps') {
              endereco = endText;
            }
          }
          // 2. Telefone (geralmente começa com tel: ou http://+ ou http://tel:)
          else if (href.startsWith('tel:') || href.startsWith('http://+') || href.startsWith('http://tel:')) {
            // Limpa o link de telefone se necessário
            telefone = text || href.replace('tel:', '').replace('http://', '');
          }
          // 3. E-mail (Cloudflare Email Protection)
          else if (href.includes('email-protection') || $a.find('.__cf_email__').length > 0) {
            const cfEmailSpan = $a.find('.__cf_email__');
            if (cfEmailSpan.length > 0) {
              const obfuscated = cfEmailSpan.attr('data-cfemail') || '';
              email = decodeCfEmail(obfuscated);
            }
          }
          // 4. Instagram
          else if (href.includes('instagram.com')) {
            instagram = href;
          }
          // 5. Facebook
          else if (href.includes('facebook.com')) {
            facebook = href;
          }
          // 6. Website (o link com texto Website)
          else if (text.toLowerCase() === 'website' || href.includes('http') && !href.includes('sodanca.world')) {
            website = href;
          }
        });

        // Caso o telefone não tenha sido capturado pela regra de href, mas contenha o ícone ou texto de telefone
        if (!telefone) {
          const telText = back.text();
          // regex simples para números de telefone internacionais comuns no site
          const telMatch = telText.match(/\+\d{1,3}[\s-]?\d{1,4}[\s-]?\d{4,9}/);
          if (telMatch) {
            telefone = telMatch[0];
          }
        }

        // Se o endereço ainda estiver em branco, tentar procurar em elementos text-end-ville ou links sem maps
        if (!endereco) {
          endereco = back.find('.text-end-ville').text().trim();
        }

        // Garantir slug único para as lojas
        let slugLoja = generateSlug(`${nomeLoja}-${cidadeLoja || paisObj.slug}`);
        let slugCounter = 1;
        while (slugsLojasCriadas.has(slugLoja)) {
          slugLoja = `${generateSlug(`${nomeLoja}-${cidadeLoja || paisObj.slug}`)}-${slugCounter}`;
          slugCounter++;
        }
        slugsLojasCriadas.add(slugLoja);

        lojas.push({
          Nome: nomeLoja,
          Cidade: cidadeLoja || undefined,
          Slug: slugLoja,
          'Pais (slug)': paisObj.slug,
          Endereco: endereco || undefined,
          LinkMaps: linkMaps || undefined,
          Telefone: telefone || undefined,
          Email: email || undefined,
          Instagram: instagram || undefined,
          Facebook: facebook || undefined,
          Website: website || undefined,
          'Logo (arquivo)': logoArquivo || undefined,
          Ordem: i + 1
        });
      }
    }

    // 3. Exportar os dados de volta para a planilha Excel do projeto
    console.log('\nExportando dados para a planilha:', OUTPUT_EXCEL);

    const workbook = xlsx.utils.book_new();

    // Aba de Paises
    const sheetPaises = xlsx.utils.json_to_sheet(paises);
    xlsx.utils.book_append_sheet(workbook, sheetPaises, 'Paises');

    // Aba de Lojas
    const sheetLojas = xlsx.utils.json_to_sheet(lojas);
    xlsx.utils.book_append_sheet(workbook, sheetLojas, 'Lojas');

    xlsx.writeFile(workbook, OUTPUT_EXCEL);

    console.log(`\n=== SUCESSO! ===`);
    console.log(`Foram catalogados ${paises.length} países e ${lojas.length} lojas.`);
    console.log(`Planilha Excel atualizada e gravada com êxito!`);

  } catch (error) {
    console.error('Erro fatal durante o scraping do site original:', error);
    process.exit(1);
  }
}

startScrape();
