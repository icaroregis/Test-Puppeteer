import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getDataExcel(ctx) {
  const console = ctx.log;
  try {
    const excelPath = path.resolve(__dirname, '/home/icaro-almeida/Documentos/pedidos.ods');
    console.info('Lendo planilha em:', excelPath);

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet);
    console.info(`Foram encontrados ${data.length} registros na planilha.`);
    return data;
  } catch (error) {
    console.error('Erro ao ler a planilha:', error);
    return [];
  }
}
