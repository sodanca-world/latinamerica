import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

const inputDir = path.resolve(process.cwd(), 'src/content');
const excelPath = path.resolve(process.cwd(), 'sodanca-latinamerica-import.xlsx');

const paisesJsonPath = path.join(inputDir, 'paises.json');
const lojasJsonPath = path.join(inputDir, 'lojas.json');

console.log('Lendo dados JSON atuais...');

if (!fs.existsSync(paisesJsonPath) || !fs.existsSync(lojasJsonPath)) {
  console.error('Erro: Arquivos json de paises ou lojas nao encontrados.');
  process.exit(1);
}

try {
  const paises = JSON.parse(fs.readFileSync(paisesJsonPath, 'utf-8'));
  const lojas = JSON.parse(fs.readFileSync(lojasJsonPath, 'utf-8'));

  // 1. Preparar dados para aba Paises
  const paisesRows = paises.map((p, index) => ({
    Nome: p.Nome,
    Slug: p.Slug,
    Ordem: p.Ordem || (index + 1)
  }));

  // 2. Preparar dados para aba Lojas
  const lojasRows = lojas.map(l => {
    // Pegar o slug do pais (loja.Pais é um array, ex: ["argentina"])
    const paisSlug = l.Pais && l.Pais.length > 0 ? l.Pais[0] : '';
    
    // Extrair o nome do arquivo do logo do array (ex: /uploads/media-1234.jpg -> media-1234.jpg)
    let logoFile = '';
    if (l.Logo && l.Logo.length > 0) {
      const url = l.Logo[0].url;
      logoFile = url.replace('/uploads/', '').replace('/assets/images/', '');
    }

    return {
      Nome: l.Nome,
      Cidade: l.Cidade || '',
      Slug: l.Slug,
      'Pais (slug)': paisSlug,
      Endereco: l.Endereco || '',
      LinkMaps: l.LinkMaps || '',
      Telefone: l.Telefone || '',
      Email: l.Email || '',
      Instagram: l.Instagram || '',
      Facebook: l.Facebook || '',
      Website: l.Website || '',
      'Logo (arquivo)': logoFile,
      Ordem: l.Ordem || ''
    };
  });

  // Criar WorkBook do Excel
  const workbook = xlsx.utils.book_new();

  // Criar planilha Paises
  const sheetPaises = xlsx.utils.json_to_sheet(paisesRows);
  xlsx.utils.book_append_sheet(workbook, sheetPaises, 'Paises');

  // Criar planilha Lojas
  const sheetLojas = xlsx.utils.json_to_sheet(lojasRows);
  xlsx.utils.book_append_sheet(workbook, sheetLojas, 'Lojas');

  // Gravar arquivo Excel
  xlsx.writeFile(workbook, excelPath);
  console.log(`=== Planilha gerada com sucesso em: ${excelPath} ===`);
  console.log(`Salvos ${paisesRows.length} paises e ${lojasRows.length} lojas.`);
} catch (error) {
  console.error('Erro ao gerar a planilha Excel:', error);
  process.exit(1);
}
