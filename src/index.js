import puppeteer from 'puppeteer';
import { initHobots } from './hobots.js';
import { login } from './actions/login.js';
import { getDataExcel } from './actions/getDataExcel.js';
import { realizarPedido } from './actions/realizarPedido.js';
import { selectItemSidebar } from './actions/selectItemSidebar.js';

(async () => {
  // Iniciar o Hobots
  initHobots();

  // 0 PASSO INICIAR O BROWSER
  const browser = await puppeteer.launch({
    headless: false,
    defaultViewport: null,
    args: ['--disable-infobars', '--start-maximized'],
  });
  const page = await browser.newPage();

  // 1 PASSO FAZER LOGIN
  await login(page);

  // 2 PASSO ACESSAR O MENU DO SIDEBAR PARA REALIZAR PEDIDO
  await selectItemSidebar(page);

  // 3 BUSCAR DADOS DA PLANILHA LIBREOFFICE
  const pedidos = await getDataExcel();

  // 4 PASSO REALIZAR O PEDIDO
  await realizarPedido(page, pedidos);

  // 5 PASSO FECHAR O BROWSER
  await browser.close();
})();
