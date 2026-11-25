/* global Bun */
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

// Reuse the web workspace's installed jsdom; this is an isolated component test, not a DSH Host preview.
const require = createRequire(new URL('../../../../web/package.json', import.meta.url));
const { JSDOM } = require('jsdom');
const build = await Bun.build({ entrypoints: [fileURLToPath(new URL('./registry-config-component.tsx', import.meta.url))],
  target: 'browser', format: 'iife', define: { 'process.env.NODE_ENV': '"production"' } });
if (!build.success) throw new AggregateError(build.logs, 'Component fixture build failed');
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
  url: 'http://127.0.0.1/', runScripts: 'dangerously', pretendToBeVisual: true,
});
const { window } = dom;
window.structuredClone = structuredClone;
const waitFor = async (predicate, description) => {
  for (let i = 0; i < 200; i++) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 5));
  }
  throw new Error(`Component state did not update: ${description}`);
};
const button = label => [...window.document.querySelectorAll('button')].find(element => element.textContent.trim() === label);
try {
  window.eval(await build.outputs[0].text());
  await waitFor(() => window.registryFixture && button('保存配置'), 'initial fixture');
  window.registryFixture.legacyOfficial();
  await waitFor(() => window.document.querySelector('input[type="checkbox"]'), 'official approval checkbox');
  const checkbox = () => window.document.querySelector('input[type="checkbox"]');
  assert.equal(checkbox().checked, false);
  assert.equal(button('测试连接').disabled, true);
  assert.equal(window.registryFixture.connectionTests(), 0);
  checkbox().click();
  await waitFor(() => checkbox().checked && !button('保存配置').disabled, 'pending approval');
  assert.equal(window.registryFixture.state().value.approvedOfficialRegistryUrl, '');
  assert.equal(button('测试连接').disabled, true);
  button('保存配置').click();
  await waitFor(() => window.registryFixture.state().value.approvedOfficialRegistryUrl === 'https://skill.xfyun.cn' && !button('测试连接').disabled, 'saved approval');
  button('测试连接').click();
  await waitFor(() => window.registryFixture.connectionTests() === 1 && window.document.querySelector('.astron-sh-config-connection-result')?.textContent.includes('连接成功'), 'authorized probe');
  checkbox().click();
  await waitFor(() => !checkbox().checked && button('测试连接').disabled && !button('保存配置').disabled, 'pending revocation');
  button('保存配置').click();
  await waitFor(() => window.registryFixture.state().value.approvedOfficialRegistryUrl === '' && button('测试连接').disabled, 'saved revocation');
  assert.equal(window.registryFixture.connectionTests(), 1);
  console.log('PASS: source approval and revocation require saving; probes stay disabled before approval and after revocation.');
} finally { window.close(); }
