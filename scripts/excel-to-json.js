import fs from 'node:fs';
import path from 'node:path';
import xlsx from 'xlsx';

const excelPath = path.resolve(process.cwd(), 'sodanca-latinamerica-import.xlsx');
const outputDir = path.resolve(process.cwd(), 'src/content');

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

console.log('Lendo planilha Excel:', excelPath);
if (!fs.existsSync(excelPath)) {
  console.error('Erro: Arquivo Excel nao encontrado em:', excelPath);
  process.exit(1);
}

try {
  const workbook = xlsx.readFile(excelPath);

  // 1. Processar Paises
  const sheetPaises = workbook.Sheets['Paises'];
  if (!sheetPaises) {
    throw new Error('Aba "Paises" nao encontrada na planilha.');
  }
  const paisesData = xlsx.utils.sheet_to_json(sheetPaises);
  const paisesMapped = paisesData.map(row => ({
    id: row.Slug || String(row.Nome).toLowerCase().replace(/\s+/g, '-'),
    Nome: row.Nome,
    Slug: row.Slug,
    Ordem: row.Ordem ? Number(row.Ordem) : undefined
  }));

  fs.writeFileSync(
    path.join(outputDir, 'paises.json'),
    JSON.stringify(paisesMapped, null, 2),
    'utf-8'
  );
  console.log(`Salvos ${paisesMapped.length} paises em src/content/paises.json`);

  // 2. Processar Lojas
  const sheetLojas = workbook.Sheets['Lojas'];
  if (!sheetLojas) {
    throw new Error('Aba "Lojas" nao encontrada na planilha.');
  }
  const lojasData = xlsx.utils.sheet_to_json(sheetLojas);
  const lojasMapped = lojasData.map(row => {
    const pais = row['Pais (slug)'];
    const paisesArray = pais ? [pais] : [];
    
    // Tratamento do Logo
    let logoArray = undefined;
    const logoFile = row['Logo (arquivo)'];
    if (logoFile) {
      const urlPath = String(logoFile).startsWith('http') 
        ? String(logoFile) 
        : `/uploads/${logoFile}`;
      logoArray = [{ url: urlPath }];
    }

    return {
      id: row.Slug,
      Nome: row.Nome,
      Cidade: row.Cidade || undefined,
      Slug: row.Slug,
      Pais: paisesArray,
      Endereco: row.Endereco || undefined,
      LinkMaps: row.LinkMaps || undefined,
      Telefone: row.Telefone ? String(row.Telefone) : undefined,
      Email: row.Email || undefined,
      Instagram: row.Instagram || undefined,
      Facebook: row.Facebook || undefined,
      Website: row.Website || undefined,
      Logo: logoArray,
      Ordem: row.Ordem ? Number(row.Ordem) : undefined
    };
  });

  fs.writeFileSync(
    path.join(outputDir, 'lojas.json'),
    JSON.stringify(lojasMapped, null, 2),
    'utf-8'
  );
  console.log(`Salvas ${lojasMapped.length} lojas em src/content/lojas.json`);
  console.log('=== Importacao da planilha Excel concluida com sucesso! ===');
} catch (error) {
  console.error('Erro ao ler a planilha Excel:', error);
  process.exit(1);
}
