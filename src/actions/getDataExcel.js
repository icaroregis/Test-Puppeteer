import XLSX from 'xlsx';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export async function getDataExcel(page) {
  try {
    const excelPath = path.resolve(__dirname, '/home/icaro-almeida/Downloads/pedidos.ods');
    console.log('Lendo planilha em:', excelPath);

    const workbook = XLSX.readFile(excelPath);
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet);
    console.log(`Foram encontrados ${data.length} registros na planilha.`);

    for (const [index, row] of data.entries()) {
      console.log(`Processando registro ${index + 1}:`, row);

      // selecionando elementos da página
      const clienteSelect = await page.waitForSelector(
        '::-p-xpath(//label[text()="Cliente"]/following-sibling::select)',
      );
      console.log('Texto do elemento:', await clienteSelect.evaluate((el) => el.textContent));

      const tipoSelect = await page.waitForSelector('::-p-xpath(//label[text()="Tipo"]/following-sibling::select)');
      console.log('Texto do elemento:', await tipoSelect.evaluate((el) => el.textContent));

      const pagamentoSelect = await page.waitForSelector(
        '::-p-xpath(//label[text()="Forma de pagamento"]/following-sibling::select)',
      );
      console.log('Texto do elemento:', await pagamentoSelect.evaluate((el) => el.textContent));

      const taxaInput = await page.waitForSelector(
        '::-p-xpath(//label[text()="Taxa de entrega"]/following-sibling::input[@type="number"])',
      );
      console.log('Valor atual da taxa de entrega:', await taxaInput.evaluate((el) => el.value));

      // capturando dados da planilha
      const clienteNome = row['CLIENTE'];
      if (clienteNome) {
        await page.evaluate(
          (selectElem, nome) => {
            const option = Array.from(selectElem.options).find(
              (opt) => opt.text.trim().toLowerCase() === String(nome).trim().toLowerCase(),
            );
            if (option) {
              selectElem.value = option.value;
              selectElem.dispatchEvent(new Event('change', { bubbles: true }));
            }
          },
          clienteSelect,
          clienteNome,
        );
      }

      const tipo = row['TIPO'];
      if (tipo) {
        await tipoSelect.select(String(tipo).toLowerCase());
      }

      const formaPagamento = row['FORMA DE PAGAMENTO'];
      if (formaPagamento) {
        await pagamentoSelect.select(String(formaPagamento).toLowerCase());
      }

      const taxaEntrega = row['TAXA DE ENTREGA'];
      console.log('Taxa de entrega:', taxaEntrega);
      if (taxaEntrega !== undefined) {
        await taxaInput.click({ clickCount: 3 });
        await taxaInput.press('Backspace');
        await taxaInput.type(String(taxaEntrega));
      }

      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('.mensagem-sucesso', { visible: true });
    }

    console.log('Todos os pedidos foram processados com sucesso!');
  } catch (error) {
    console.error('Erro ao ler a planilha ou preencher formulário:', error);
  }
}
