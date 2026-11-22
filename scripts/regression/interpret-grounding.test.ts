import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import os from 'node:os';
import Module from 'node:module';
import path from 'node:path';
import { generateChart } from '../../lib/ziwei/algorithm';

async function main() {
  const cwd = process.cwd();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ziwei-interpret-test-'));
  try {
    process.chdir(tmp);
    Object.assign(process.env, {
      AI_PROVIDER: 'claude-code', AI_FALLBACK: '', TRACE_FILE: '0',
      LANGFUSE_PUBLIC_KEY: '', DATASET_V4_AUTO_DOWNLOAD: '0',
      CLAUDE_CODE_BIN: path.join(tmp, 'fake-claude'),
    });
    const cache = path.join(tmp, 'data/dataset-v4/cache');
    await mkdir(cache, { recursive: true });
    const k = '1990-05-15-6-female';
    await writeFile(path.join(cache, k + '.json'), JSON.stringify({ k, c: { move: '此为迁移宫测试原文。', love: '未选中的段落。' } }));
    await writeFile(process.env.CLAUDE_CODE_BIN!, `#!/usr/bin/env node
const assert = require('node:assert/strict');
const prompt = process.argv[process.argv.indexOf('--system-prompt') + 1];
const chart = JSON.parse(prompt.split('[Lá số]\\n')[1].split('\\n\\n')[0]);
assert.equal(chart.十二宫.length, 12);
assert.ok(chart.十二宫.every(p => /[一-龥]/.test(p.宫) && Array.isArray(p.星曜)));
if (chart.阳历[0] === 1990) {
  assert.ok(prompt.includes('[Dataset v4 · Thiên di]\\n此为迁移宫测试原文。'));
} else {
  assert.ok(prompt.includes('此问题没有可用的数据集原文'));
  assert.ok(!prompt.includes('此为迁移宫测试原文。'));
}
assert.ok(!prompt.includes('未选中的段落。'));
assert.ok(!prompt.includes('[Nguồn:'));
for (const delta of [{ type: 'thinking_delta', thinking: 'private analysis' }, { type: 'text_delta', text: 'Đã đối chiếu.' }]) {
  console.log(JSON.stringify({ type: 'stream_event', event: { type: 'content_block_delta', delta } }));
}
`, { mode: 0o755 });

    // Next aliases server-only to an empty module in server builds. Reproduce
    // that resolution for this standalone test, including on Node 20.
    const testModules = path.join(tmp, 'node_modules');
    const marker = path.join(testModules, 'server-only');
    await mkdir(marker, { recursive: true });
    await writeFile(path.join(marker, 'index.js'), '');
    process.env.NODE_PATH = [testModules, process.env.NODE_PATH].filter(Boolean).join(path.delimiter);
    (Module as typeof Module & { _initPaths(): void })._initPaths();
    // Import after changing cwd so dataset lookup resolves the isolated fixture.
    const { POST } = await import('../../app/api/interpret/route');
    for (const year of [1990, 1949]) {
      const chart = generateChart({ year, month: 5, day: 15, hour: 6, gender: 'female' });
      const response = await POST(new Request('http://localhost/api/interpret', {
        method: 'POST', body: JSON.stringify({ chart, messages: [{ role: 'user', content: 'Thiên di' }] }),
      }));
      assert.equal(response.status, 200);
      assert.equal(await response.text(), 'data: {"delta":{"text":"Đã đối chiếu."}}\n\ndata: [DONE]\n\n');
    }
    console.log('interpret-grounding passed');
  } finally {
    process.chdir(cwd);
    await rm(tmp, { recursive: true, force: true });
  }
}
void main();
