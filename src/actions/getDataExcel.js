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

      // dados gerais
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
        '::-p-xpath(//label[text()="Taxa de entrega"]/following-sibling::input[@type="number"]',
      );
      console.log('Texto do elemento:', await taxaInput.evaluate((el) => el.textContent));

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
      if (taxaEntrega !== undefined) {
        await taxaInput.click({ clickCount: 3 });
        await taxaInput.press('Backspace');
        await taxaInput.type(String(taxaEntrega));
      }

      // const itensPedidoStr = row['ITENS DO PEDIDO'];
      // console.log('Itens do pedido:', itensPedidoStr);
      // const quantidadeItem = Number(row['QUANTIDADE']) || 1;
      // console.log('Quantidade do item:', quantidadeItem);

      // if (itensPedidoStr) {
      //   const containerPizza = await page.waitForSelector('::-p-xpath(//div[div[text()="Pizza"]])');

      //   const botaoMaisHandle = await page.evaluateHandle(
      //     (container, itemNome) => {
      //       const linhasDosItens = Array.from(container.querySelectorAll('.justify-between'));

      //       const linhaDoItem = linhasDosItens.find((linha) =>
      //         linha.textContent.toLowerCase().includes(itemNome.toLowerCase()),
      //       );

      //       if (linhaDoItem) {
      //         const botoes = linhaDoItem.querySelectorAll('button');
      //         return botoes[botoes.length - 1];
      //       }
      //       return null;
      //     },
      //     containerPizza,
      //     itensPedidoStr,
      //   );

      //   if (botaoMaisHandle && botaoMaisHandle.asElement()) {
      //     for (let i = 0; i < quantidadeItem; i += 1) {
      //       await botaoMaisHandle.click();
      //     }
      //     await botaoMaisHandle.dispose();
      //   }
      // }

      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('.mensagem-sucesso', { visible: true });
    }

    console.log('Todos os pedidos foram processados com sucesso!');
  } catch (error) {
    console.error('Erro ao ler a planilha ou preencher formulário:', error);
  }
}
