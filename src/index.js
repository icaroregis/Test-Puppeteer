import puppeteer from 'puppeteer';
import * as Hobots from 'hobots';
import { initHobots } from './hobots.js';
import { login } from './actions/login.js';
import { getDataExcel } from './actions/getDataExcel.js';
import { realizarPedido } from './actions/realizarPedido.js';
import { selectItemSidebar } from './actions/selectItemSidebar.js';

// INICIAR O HOBOTS
initHobots();

// REGISTRAR A TAREFA
Hobots.register(process.env.TASK_SLUG, async (_params, ctx) => {
  const console = ctx.log;
  console.info('Iniciando o processamento dos pedidos da planilha.');

  // 0 PASSO INICIAR O BROWSER
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--disable-infobars', '--start-maximized'],
  });

  try {
    const page = await browser.newPage();

    // 1 PASSO FAZER LOGIN
    await login(page);

    // 2 PASSO ACESSAR O MENU DO SIDEBAR PARA REALIZAR PEDIDO
    await selectItemSidebar(page);

    // 3 BUSCAR DADOS DA PLANILHA LIBREOFFICE
    const pedidos = await getDataExcel();

    // 4 PASSO REALIZAR O PEDIDO
    await realizarPedido(page, pedidos, console);
  } finally {
    // 5 PASSO FECHAR O BROWSER
    await browser.close();
  }

  console.info('Processamento dos pedidos concluido.');
});

Hobots.start();
