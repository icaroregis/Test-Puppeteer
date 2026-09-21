import retry from 'async-retry';

export async function login(page) {
  // usando lib async retry para tentar login 2 vezes
  await retry(
    async () => {
      await page.goto('https://peddemo.hobots.app/signin');
      await page.waitForSelector('form', { visible: true, timeout: 30000 });

      await page.locator('#email').fill('admin@peddemo.com');
      await page.locator('#password').fill('admin123');

      await page.locator('button[type="submit"]').click();
      await page.waitForSelector('a[href="/pedidos"]', { visible: true, timeout: 30000 });
    },
    {
      retries: 2,
      delay: 1000,
    },
  );
  return;
}
