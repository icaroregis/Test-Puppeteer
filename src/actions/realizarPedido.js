import { textoNormalizado } from '../utils/textoNormalizado.js';

export async function realizarPedido(page, pedidos) {
  const confirmacaoPedido = '::-p-xpath(//div[normalize-space(text())="Pedido criado com sucesso."])';

  for (const [index, row] of pedidos.entries()) {
    console.log(`Processando registro ${index + 1}:`, row);

    if (index > 0) {
      await page.locator('button ::-p-text(+ Novo pedido)').click();
    }

    const clienteSelect = await page.waitForSelector('::-p-xpath(//label[text()="Cliente"]/following-sibling::select)');
    const tipoSelect = await page.waitForSelector('::-p-xpath(//label[text()="Tipo"]/following-sibling::select)');
    const pagamentoSelect = await page.waitForSelector(
      '::-p-xpath(//label[text()="Forma de pagamento"]/following-sibling::select)',
    );

    const clienteNome = row['CLIENTE'];
    if (clienteNome) {
      await page.evaluate(
        (selectElem, nome) => {
          const option = Array.from(selectElem.options).find(
            (opt) => opt.text.trim().toLowerCase() === String(nome).trim().toLowerCase(),
          );
          if (!option) {
            throw new Error(`Cliente "${nome}" não encontrado.`);
          }
          selectElem.value = option.value;
          selectElem.dispatchEvent(new Event('change', { bubbles: true }));
        },
        clienteSelect,
        clienteNome,
      );
    }

    const tipoSelecionado = textoNormalizado(row['TIPO']);
    if (tipoSelecionado) {
      await tipoSelect.select(tipoSelecionado);
    }

    const formaPagamento = row['FORMA DE PAGAMENTO'];
    if (formaPagamento) {
      await pagamentoSelect.select(textoNormalizado(formaPagamento));
    }

    if (tipoSelecionado === 'entrega') {
      const taxaInput = await page.waitForSelector(
        '::-p-xpath(//label[text()="Taxa de entrega"]/following-sibling::input[@type="number"])',
      );
      const taxaEntrega = row['TAXA DE ENTREGA'];
      if (taxaEntrega !== undefined && taxaEntrega !== null && taxaEntrega !== '') {
        await taxaInput.click({ clickCount: 3 });
        await taxaInput.press('Backspace');
        await taxaInput.type(String(taxaEntrega));
      }
    }

    const itensPedidoStr = row['ITENS DO PEDIDO'];
    const quantidade = Number(row['QUANTIDADE']);
    const pizzaContainer = await page.waitForSelector('::-p-xpath(//div[normalize-space(text())="Pizza"]/parent::div)');
    const linhaPizzaHandle = await pizzaContainer.evaluateHandle((container, nomePizza) => {
      function textoNormalizado(text) {
        return String(text ?? '')
          .trim()
          .toLowerCase();
      }

      return (
        Array.from(container.children)
          .slice(1)
          .find((linha) => textoNormalizado(linha.querySelector('p')?.textContent) === textoNormalizado(nomePizza)) ??
        null
      );
    }, itensPedidoStr);
    const linhaPizza = linhaPizzaHandle.asElement();

    if (!linhaPizza) {
      const saboresDisponiveis = await pizzaContainer.evaluate((container) =>
        Array.from(container.children)
          .slice(1)
          .map((linha) => linha.querySelector('p')?.textContent?.trim())
          .filter(Boolean),
      );
      await linhaPizzaHandle.dispose();
      console.warn(
        `Pedido ${index + 1} ignorado: pizza "${itensPedidoStr}" não encontrada. Sabores disponíveis: ${saboresDisponiveis.join(', ')}.`,
      );
      await page.locator('form button ::-p-text(Cancelar)').click();
      await page.waitForSelector('button[type="submit"]', { hidden: true });
      continue;
    }

    const botaoAdicionarHandle = await linhaPizza.evaluateHandle(
      (linha) => Array.from(linha.querySelectorAll('button')).find((botao) => botao.textContent.trim() === '+') ?? null,
    );
    const botaoAdicionar = botaoAdicionarHandle.asElement();
    if (!botaoAdicionar) {
      await botaoAdicionarHandle.dispose();
      await linhaPizzaHandle.dispose();
      throw new Error(`Botão de adicionar não encontrado para "${itensPedidoStr}".`);
    }

    for (let unidade = 0; unidade < quantidade; unidade += 1) {
      await botaoAdicionar.click();
    }

    await page.waitForFunction(
      (linha, quantidadeEsperada) => Number(linha.querySelector('span')?.textContent) === quantidadeEsperada,
      {},
      linhaPizza,
      quantidade,
    );
    console.log(`${quantidade} unidade(s) de "${itensPedidoStr}" adicionada(s).`);

    await botaoAdicionarHandle.dispose();
    await linhaPizzaHandle.dispose();

    await page.waitForSelector(confirmacaoPedido, { hidden: true });
    await Promise.all([
      page.waitForSelector(confirmacaoPedido, { visible: true }),
      page.locator('button[type="submit"]').click(),
    ]);
    await page.waitForSelector('button[type="submit"]', { hidden: true });
  }

  console.log('Todos os pedidos foram processados com sucesso!');
}
