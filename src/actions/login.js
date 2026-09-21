export async function login(page) {
  for (let tentativa = 1; tentativa <= 2; tentativa += 1) {
    try {
      await page.goto('https://peddemo.hobots.app/signin');

      await page.locator('#email').fill('admin@peddemo.com');
      await page.locator('#password').fill('admin123');

      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('a[href="/pedidos"]', { visible: true, timeout: 30000 });
      return;
    } catch (erro) {
      if (tentativa === 2) {
        throw erro;
      }
    }
  }
}
