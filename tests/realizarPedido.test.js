import assert from 'node:assert/strict';
import { test } from 'node:test';
import { realizarPedido } from '../src/actions/realizarPedido.js';

const row = {
  CLIENTE: 'Cliente teste',
  TIPO: 'retirada',
  'FORMA DE PAGAMENTO': 'dinheiro',
  'ITENS DO PEDIDO': 'Calabresa',
  QUANTIDADE: 2,
};

function setup(options = {}) {
  let visible = options.open ?? false;
  let attempt = 0;
  let units = 0;
  const state = {
    logs: [], items: [], steps: [], handles: [], starts: [],
    opens: 0, submits: 0, adds: 0, progress: 0,
  };
  const log = (message) => {
    state.logs.push(message);
    if (/tentativa \d\/3 de abrir/.test(message)) {
      attempt += 1;
      state.starts.push(Date.now());
    }
  };
  const fail = (point) => {
    if (options.failAt === point && attempt <= (options.failures ?? 1)) {
      throw new Error(`Falha temporaria: ${point}`);
    }
  };
  const handle = (type, methods = {}) => {
    const result = {
      type, disposed: false, attempt,
      dispose: async () => { result.disposed = true; },
      ...methods,
    };
    state.handles.push(result);
    return result;
  };
  const step = (op, description) => {
    const result = {
      op, description, status: 'ok', finished: false,
      startChild: step,
      setStatus(status) { this.status = status; return this; },
      setData() { return this; },
      finish() { this.finished = true; },
    };
    state.steps.push(result);
    return result;
  };
  const button = { click: async () => { fail('adicionar'); units++; state.adds++; } };
  const line = {
    evaluateHandle: async () => handle('botao', { asElement: () => button }),
    querySelector: () => ({ textContent: String(units) }),
  };
  const container = {
    evaluateHandle: async () => handle('linha', { asElement: () => options.missingPizza ? null : line }),
    evaluate: async () => ['Mussarela'],
  };
  const page = {
    $: async () => options.hiddenForm || visible
      ? handle('consulta-form', { isVisible: async () => visible }) : null,
    locator: (selector) => {
      const locator = {
        setTimeout(ms) {
          assert.equal(ms, selector.includes('Cancelar') ? 2000 : 30000);
          return locator;
        },
        click: async () => {
          if (selector.includes('+ Novo pedido')) {
            state.opens++;
            fail('abrir');
            visible = true;
            fail('apos-abrir');
          } else if (selector.includes('Cancelar')) {
            visible = false;
            units = 0;
          } else if (selector === 'button[type="submit"]') {
            state.submits++;
            visible = false;
            units = 0;
          } else {
            assert.fail(`Locator inesperado: ${selector}`);
          }
        },
      };
      return locator;
    },
    waitForSelector: async (selector, config) => {
      if (selector === 'form') {
        assert.deepEqual(config, { visible: true, timeout: 30000 });
        fail('form');
        assert.ok(visible);
        return handle('form');
      }
      if (selector.includes('following-sibling::select')) {
        assert.deepEqual(config, { visible: true, timeout: 30000 });
        if (selector.includes('Tipo')) fail('select');
        return handle('select', { select: async () => {} });
      }
      if (selector.includes('parent::div')) return container;
      if (selector.includes('Pedido criado com sucesso.') && config.visible) fail('confirmacao');
      return null;
    },
    evaluate: async () => {},
    waitForFunction: async (fn, _, element, quantity) => assert.ok(fn(element, quantity)),
    screenshot: async () => undefined,
  };
  const ctx = {
    log: { info: log, warn: log, error: log },
    transaction: { startChild: step },
    items: {
      succeeded: (payload, extra) => state.items.push({ status: 'succeeded', payload, ...extra }),
      failed: (message, payload, extra) => state.items.push({ status: 'failed', message, payload, ...extra }),
      occurrence: (message, payload, extra) => state.items.push({ status: 'occurrence', message, payload, ...extra }),
    },
    progress: { advance: () => { state.progress++; } },
  };
  return {
    state,
    run: async (rows = [row]) => {
      await realizarPedido(page, rows, ctx);
      assert.equal(state.progress, rows.length);
      assert.ok(state.steps.every(entry => entry.finished));
    },
  };
}

for (const [name, options, opens] of [
  ['formulario ja aberto', { open: true }, 0],
  ['primeiro formulario fechado', {}, 1],
  ['formulario oculto', { hiddenForm: true }, 1],
]) {
  test(`sucesso com ${name}`, async () => {
    const { run, state } = setup(options);
    await run();
    assert.equal(state.opens, opens);
    assert.equal(state.starts.length, 1);
    assert.equal(state.submits, 1);
    assert.equal(state.adds, 2);
    assert.equal(state.items[0].status, 'succeeded');
    assert.ok(state.logs.some(message => message.includes('criado com sucesso')));
  });
}

for (const point of ['abrir', 'apos-abrir', 'form', 'select']) {
  test(`recupera falha temporaria em ${point}`, async () => {
    const { run, state } = setup({ failAt: point });
    await run();
    assert.equal(state.starts.length, 2);
    assert.ok(state.starts[1] - state.starts[0] >= 950, 'Espera aproximadamente 1000ms antes do retry');
    assert.equal(state.opens, point === 'abrir' ? 2 : 1, 'Nao reclica se o formulario abriu');
    assert.equal(state.submits, 1);
    assert.equal(state.adds, 2);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].status, 'succeeded');
    assert.ok(state.logs.some(message => message.includes('tentativa 1/3 falhou')));
    assert.ok(state.logs.some(message => message.includes('formulario pronto na tentativa 2/3')));
    assert.ok(state.handles.filter(h => h.attempt === 1).every(h => h.disposed));
  });
}

test('recupera na terceira e ultima tentativa', async () => {
  const { run, state } = setup({ failAt: 'abrir', failures: 2 });
  await run();
  assert.equal(state.starts.length, 3);
  assert.equal(state.submits, 1);
  assert.equal(state.items[0].status, 'succeeded');
});

test('encerra depois de tres falhas e registra um unico item', async () => {
  const { run, state } = setup({ failAt: 'abrir', failures: Infinity });
  await run();
  assert.equal(state.starts.length, 3);
  assert.equal(state.opens, 3);
  assert.equal(state.submits, 0);
  assert.equal(state.items.length, 1);
  assert.equal(state.items[0].status, 'failed');
  assert.match(state.items[0].message, /Abrir formulario do pedido.*Falha temporaria: abrir/);
  assert.equal(state.logs.filter(message => /tentativa \d\/3 falhou/.test(message)).length, 3);
});

test('continua para o pedido seguinte apos esgotar o retry', async () => {
  const { run, state } = setup({ failAt: 'abrir', failures: 3 });
  await run([row, row]);
  assert.deepEqual(state.items.map(item => item.status), ['failed', 'succeeded']);
  assert.deepEqual(state.items.map(item => item.id), ['1', '2']);
  assert.equal(state.submits, 1);
});

for (const point of ['adicionar', 'confirmacao']) {
  test(`nao repete a compra apos falha em ${point}`, async () => {
    const { run, state } = setup({ failAt: point });
    await run();
    assert.equal(state.starts.length, 1);
    assert.equal(state.submits, point === 'confirmacao' ? 1 : 0);
    assert.equal(state.items.length, 1);
    assert.equal(state.items[0].status, 'failed');
  });
}

test('pizza indisponivel continua sendo ocorrencia, sem retry', async () => {
  const { run, state } = setup({ missingPizza: true });
  await run();
  assert.equal(state.starts.length, 1);
  assert.equal(state.submits, 0);
  assert.equal(state.items[0].status, 'occurrence');
});
