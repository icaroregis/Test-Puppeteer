export async function login(page) {
  await page.goto('https://peddemo.hobots.app/signin');

  await page.locator('#email').fill('admin@peddemo.com');
  await page.locator('#password').fill('admin123');

  await page.locator('button[type="submit"]').click();
}
