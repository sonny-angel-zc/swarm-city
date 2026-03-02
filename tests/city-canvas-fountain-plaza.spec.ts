import { expect, test } from 'playwright/test';

type DrawLog = {
  ellipses: Array<{ index: number; x: number; y: number; rx: number; ry: number }>;
  moves: Array<{ index: number; x: number; y: number }>;
};

const TOLERANCE = 0.12;

function near(a: number, b: number, tolerance = TOLERANCE): boolean {
  return Math.abs(a - b) <= tolerance;
}

test('CityCanvas fountain plaza composition draws expected geometry', async ({ page }) => {
  await page.addInitScript(() => {
    const log: DrawLog = { ellipses: [], moves: [] };
    let callIndex = 0;

    const proto = CanvasRenderingContext2D.prototype;
    const originalEllipse = proto.ellipse;
    const originalMoveTo = proto.moveTo;

    proto.ellipse = function patchedEllipse(this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D['ellipse']>) {
      const [x, y, rx, ry] = args;
      if (log.ellipses.length < 5000) {
        log.ellipses.push({ index: callIndex++, x, y, rx, ry });
      }
      return originalEllipse.apply(this, args);
    };

    proto.moveTo = function patchedMoveTo(this: CanvasRenderingContext2D, ...args: Parameters<CanvasRenderingContext2D['moveTo']>) {
      const [x, y] = args;
      if (log.moves.length < 5000) {
        log.moves.push({ index: callIndex++, x, y });
      }
      return originalMoveTo.apply(this, args);
    };

    (window as unknown as { __cityCanvasDrawLog?: DrawLog }).__cityCanvasDrawLog = log;
  });

  await page.goto('/');
  await expect(page.locator('canvas')).toBeVisible();
  await page.waitForTimeout(300);

  const drawLog = await page.evaluate(() => {
    return (window as unknown as { __cityCanvasDrawLog?: DrawLog }).__cityCanvasDrawLog;
  });

  expect(drawLog).toBeTruthy();
  if (!drawLog) {
    return;
  }

  const ellipses = drawLog.ellipses;
  const moves = drawLog.moves;

  const ringLight = ellipses.find(e => near(e.x, 0) && near(e.y, 285) && near(e.rx, 54) && near(e.ry, 30));
  const basinRim = ellipses.find(e => near(e.x, 0) && near(e.y, 285) && near(e.rx, 36) && near(e.ry, 20));
  const waterSurface = ellipses.find(e => near(e.x, 0) && near(e.y, 285) && near(e.rx, 30) && near(e.ry, 17));

  expect(ringLight, 'expected fountain ring light ellipse at plaza center').toBeTruthy();
  expect(basinRim, 'expected fountain basin rim ellipse at plaza center').toBeTruthy();
  expect(waterSurface, 'expected fountain water surface ellipse at plaza center').toBeTruthy();

  expect(ringLight!.index).toBeLessThan(basinRim!.index);

  const planterCenters = [
    { x: 0, y: 262 },
    { x: 32, y: 281 },
    { x: 0, y: 300 },
    { x: -32, y: 281 },
  ];

  for (const planter of planterCenters) {
    const planterEllipse = ellipses.find(e => (
      near(e.x, planter.x) && near(e.y, planter.y) && near(e.rx, 4.2) && near(e.ry, 2.7)
    ));
    expect(planterEllipse, `missing planter top ellipse at (${planter.x}, ${planter.y})`).toBeTruthy();
  }

  const benchTopStartPoints = [
    { x: 0, y: -39.5 },
    { x: 28, y: -6.5 },
    { x: 0, y: 26.5 },
    { x: -28, y: -6.5 },
  ];

  for (const benchTopStart of benchTopStartPoints) {
    const benchTopMove = moves.find(m => near(m.x, benchTopStart.x) && near(m.y, benchTopStart.y));
    expect(benchTopMove, `missing bench top geometry anchor at (${benchTopStart.x}, ${benchTopStart.y})`).toBeTruthy();
  }
});
