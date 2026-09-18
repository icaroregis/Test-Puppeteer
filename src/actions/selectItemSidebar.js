export async function selectItemSidebar(page) {
  await page.goto('https://peddemo.hobots.app/dashboard');

  await page.waitForSelector('a[href="/pedidos"]');
  await page.click('a[href="/pedidos"]');

  await page.waitForSelector('button ::-p-text(+ Novo pedido)');
  await page.click('button ::-p-text(+ Novo pedido)');
}
