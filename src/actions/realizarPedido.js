import * as Hobots from 'hobots';
import retry from 'async-retry';
import { textoNormalizado } from '../utils/textoNormalizado.js';

export async function realizarPedido(page, pedidos, ctx) {
  const console = ctx.log;
  const confirmacaoPedido = '::-p-xpath(//div[normalize-space(text())="Pedido criado com sucesso."])';

  for (const [index, row] of pedidos.entries()) {
    const numeroPedido = index + 1;
    const clienteNome = row['CLIENTE'];
    const tipoSelecionado = textoNormalizado(row['TIPO']);
    const formaPagamento = row['FORMA DE PAGAMENTO'];
    const taxaEntrega = row['TAXA DE ENTREGA'];
    const itensPedidoStr = row['ITENS DO PEDIDO'];
    const quantidade = Number(row['QUANTIDADE']);
    const payload = {
      cliente: clienteNome,
      tipo: tipoSelecionado,
      forma_pagamento: formaPagamento,
      item: itensPedidoStr,
      quantidade,
    };

    console.info(`Processando registro ${numeroPedido}:`, row);
    const step = ctx.transaction.startChild('pedido', `${clienteNome ?? 'pedido'} · ${itensPedidoStr ?? ''}`);
    let etapa;
    let nomeEtapa;
    const iniciarEtapa = (nome) => {
      etapa?.finish();
      nomeEtapa = nome;
      etapa = step.startChild('pedido.etapa', nome);
    };

    try {
      iniciarEtapa('Abrir formulário do pedido');
      // Repete apenas a preparação: reenviar um pedido pode duplicar a compra.
      const { clienteSelect, tipoSelect, pagamentoSelect } = await retry(
        async (_bail, tentativa) => {
          console.info(`Pedido ${numeroPedido}: tentativa ${tentativa}/3 de abrir o formulário.`);
          const handles = [];
          try {
            const formulario = await page.$('form');
            let formularioVisivel = false;
            if (formulario) {
              try {
                formularioVisivel = await formulario.isVisible();
              } finally {
                await formulario.dispose();
              }
            }
            if (!formularioVisivel) {
              await page.locator('button ::-p-text(+ Novo pedido)').setTimeout(30000).click();
            }

            const form = await page.waitForSelector('form', { visible: true, timeout: 30000 });
            handles.push(form);
            const selects = [];
            for (const label of ['Cliente', 'Tipo', 'Forma de pagamento']) {
              const select = await page.waitForSelector(
                `::-p-xpath(//label[text()="${label}"]/following-sibling::select)`,
                { visible: true, timeout: 30000 },
              );
              handles.push(select);
              selects.push(select);
            }
            await form.dispose();
            console.info(`Pedido ${numeroPedido}: formulário pronto na tentativa ${tentativa}/3.`);
            return { clienteSelect: selects[0], tipoSelect: selects[1], pagamentoSelect: selects[2] };
          } catch (erro) {
            await Promise.all(handles.map((handle) => handle.dispose().catch(() => {})));
            console.warn(`Pedido ${numeroPedido}: tentativa ${tentativa}/3 falhou: ${erro.message ?? erro}`);
            throw erro;
          }
        },
        {
          retries: 2,
          minTimeout: 1000,
          maxTimeout: 1000,
          factor: 1,
          randomize: false,
          onRetry: (_erro, tentativa) => {
            console.info(`Pedido ${numeroPedido}: nova tentativa (${tentativa + 1}/3) em 1000ms.`);
          },
        },
      );

      if (clienteNome) {
        iniciarEtapa('Selecionar cliente');
        console.info(`Buscando cliente "${clienteNome}"...`);
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

      if (tipoSelecionado) {
        iniciarEtapa('Selecionar tipo do pedido');
        console.info(`Selecionando tipo de pedido "${tipoSelecionado}"...`);
        await tipoSelect.select(tipoSelecionado);
      }

      if (formaPagamento) {
        iniciarEtapa('Selecionar forma de pagamento');
        console.info(`Selecionando forma de pagamento "${formaPagamento}"...`);
        await pagamentoSelect.select(textoNormalizado(formaPagamento));
      }

      if (tipoSelecionado === 'entrega') {
        iniciarEtapa('Preencher taxa de entrega');
        const taxaInput = await page.waitForSelector(
          '::-p-xpath(//label[text()="Taxa de entrega"]/following-sibling::input[@type="number"])',
        );
        if (taxaEntrega !== undefined && taxaEntrega !== null && taxaEntrega !== '') {
          console.info(`Informando taxa de entrega "${taxaEntrega}"...`);
          await taxaInput.click({ clickCount: 3 });
          await taxaInput.press('Backspace');
          await taxaInput.type(String(taxaEntrega));
        }
      }

      iniciarEtapa('Localizar pizza');
      const pizzaContainer = await page.waitForSelector(
        '::-p-xpath(//div[normalize-space(text())="Pizza"]/parent::div)',
      );
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
        const mensagem = `pizza "${itensPedidoStr}" não encontrada. Sabores disponíveis: ${saboresDisponiveis.join(', ')}.`;
        console.info(`Pedido ${numeroPedido} ignorado: ${mensagem}`);
        etapa.setStatus('warning').finish();
        iniciarEtapa('Cancelar pedido sem pizza disponivel');
        await page.locator('form button ::-p-text(Cancelar)').click();
        await page.waitForSelector('button[type="submit"]', { hidden: true });
        etapa.finish();

        ctx.items.occurrence(mensagem, payload, { id: String(numeroPedido) });
        step.setStatus('warning').finish();
        continue;
      }

      iniciarEtapa('Adicionar quantidade da pizza');
      const botaoAdicionarHandle = await linhaPizza.evaluateHandle(
        (linha) =>
          Array.from(linha.querySelectorAll('button')).find((botao) => botao.textContent.trim() === '+') ?? null,
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
      console.info(`${quantidade} unidade(s) de "${itensPedidoStr}" adicionada(s).`);

      await botaoAdicionarHandle.dispose();
      await linhaPizzaHandle.dispose();

      iniciarEtapa('Enviar pedido e aguardar confirmacao');
      await page.waitForSelector(confirmacaoPedido, { hidden: true });
      await Promise.all([
        page.waitForSelector(confirmacaoPedido, { visible: true }),
        page.locator('button[type="submit"]').click(),
      ]);
      await page.waitForSelector('button[type="submit"]', { hidden: true });
      etapa.finish();
      ctx.items.succeeded(payload, { id: String(numeroPedido) });
      console.info(`Pedido ${numeroPedido} criado com sucesso.`);
      step.finish();
    } catch (erro) {
      const mensagem = `Etapa "${nomeEtapa}": ${erro.message ?? erro}`;
      etapa
        ?.setData('erro', String(erro.message ?? erro))
        .setStatus('error')
        .finish();
      step.setStatus('error').finish();
      console.error(`Pedido ${numeroPedido} falhou: ${mensagem}`);
      const screenshot = await page.screenshot().catch(() => undefined);
      Hobots.captureException(erro, {
        extra: { pedido: numeroPedido, etapa: nomeEtapa },
        attachment: screenshot && { image: screenshot, caption: `pedido ${numeroPedido}` },
      });
      ctx.items.failed(mensagem, payload, { id: String(numeroPedido) });

      try {
        await page.locator('form button ::-p-text(Cancelar)').setTimeout(2000).click();
        await page.waitForSelector('button[type="submit"]', { hidden: true, timeout: 2000 });
      } catch {}
    } finally {
      ctx.progress.advance();
    }
  }

  console.info('Processamento de todos os pedidos finalizado.');
}
