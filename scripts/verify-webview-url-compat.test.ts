import { expect, test } from "bun:test"
import { fileURLToPath } from "node:url"

const polyfills = fileURLToPath(new URL("../vendor/upstream/packages/app/src/runtime/polyfills.ts", import.meta.url))
const policy = fileURLToPath(new URL("../vendor/upstream/packages/gui-plugins/src/browser/policy.ts", import.meta.url))
const markdownImage = fileURLToPath(new URL("../vendor/upstream/packages/session-ui/src/components/markdown-image.ts", import.meta.url))

for (const missing of [[], ["canParse"], ["parse"], ["canParse", "parse"]]) {
  test(`URL polyfills preserve behavior when missing ${missing.join(",") || "nothing"}`, async () => {
    const script = `
      const assert = require('node:assert/strict');
      const missing = ${JSON.stringify(missing)};
      const native = { canParse: URL.canParse, parse: URL.parse };
      for (const key of missing) delete URL[key];
      await import(${JSON.stringify(polyfills)});
      for (const key of ['canParse', 'parse']) {
        if (!missing.includes(key)) assert.equal(URL[key], native[key]);
        assert.equal(typeof URL[key], 'function');
      }
      assert.equal(URL.canParse('/x', 'https://example.com/a'), true);
      assert.equal(URL.parse('/x', 'https://example.com/a').href, 'https://example.com/x');
      assert.equal(URL.canParse('http://['), false);
      assert.equal(URL.parse('http://['), null);
      assert.throws(() => URL.canParse());
      assert.throws(() => URL.parse());
      const failure = new Error('conversion');
      const bad = { toString() { throw failure } };
      assert.throws(() => URL.canParse(bad), e => e === failure);
      assert.throws(() => URL.parse(bad), e => e === failure);
      assert.throws(() => URL.canParse('/x', bad), e => e === failure);
      assert.throws(() => URL.parse('/x', bad), e => e === failure);
      const policy = await import(${JSON.stringify(policy)});
      assert.equal(policy.destinationOrigin('https://example.com/path'), 'https://example.com');
      assert.equal(policy.destinationOrigin('https://user:secret@example.com'), undefined);
      assert.equal(policy.allowedDestination('javascript:alert(1)'), false);
      assert.equal(policy.localFileURL('file://remote/etc/passwd'), undefined);
      assert.equal(policy.fileURLWithin('file:///workspace/a', ['/workspace']), true);
      assert.equal(policy.fileURLWithin('file:///workspace-evil/a', ['/workspace']), false);
      const image = await import(${JSON.stringify(markdownImage)});
      assert.equal(image.localImagePath('file:///workspace/a.png'), '/workspace/a.png');
      assert.equal(image.localImagePath('file://remote/a.png'), undefined);
      assert.equal(image.localImagePath('javascript:alert(1)'), undefined);
      assert.equal(image.localImagePath('//remote/a.png'), undefined);
    `
    const child = Bun.spawn([process.execPath, "--eval", script], { stdout: "pipe", stderr: "pipe" })
    const stderr = await new Response(child.stderr).text()
    const code = await child.exited
    expect({ code, stderr }).toEqual({ code: 0, stderr: "" })
  })
}
