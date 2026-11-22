import assert from 'node:assert/strict';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { generateChart } from '../../lib/ziwei/algorithm';

async function main() {
  const cwd = process.cwd();
  const tmp = await mkdtemp(path.join(os.tmpdir(), 'ziwei-general-'));
  try {
    process.chdir(tmp);
    const { DATASET_DIMS, datasetKey } = await import('../../lib/ai/dataset-v4');
    const { knowledgeBlock } = await import('../../lib/ai/knowledge');
    const chart = generateChart({ year: 2001, month: 7, day: 25, hour: 1, gender: 'male' });
    const key = datasetKey(chart);
    const cache = path.join(tmp, 'data/dataset-v4/cache');
    await mkdir(cache, { recursive: true });
    const topics = Object.fromEntries(DATASET_DIMS.map(dim => [dim, `原文（${dim}）。`.repeat(600)]));
    for (const dim of DATASET_DIMS) topics[dim] += '\n\n建议先核对资料。';
    topics.parents += '\n\n**【流月】**\n\n月度原文测试，须核对条件。';
    await writeFile(path.join(cache, key + '.json'), JSON.stringify({ k: key, c: topics }));

    for (const question of ['tháng 9 âm tôi cần lưu ý điều gì', 'Con đường sắp tới của tôi thế nào?']) {
      const { stats, text } = await knowledgeBlock(chart, question);
      assert.deepEqual(stats.dataset.dims, [...DATASET_DIMS]);
      assert.ok(text.length <= 8000);
      for (const dim of DATASET_DIMS) assert.ok(text.includes(`原文（${dim}）。`));
    }
    const focused = await knowledgeBlock(chart, 'Tháng 9 âm cần lưu ý gì về công việc?');
    assert.deepEqual(focused.stats.dataset.dims, ['career']);
    const multiple = await knowledgeBlock(chart, 'Hôn nhân, công việc và sức khỏe ra sao?');
    assert.deepEqual(multiple.stats.dataset.dims.sort(), ['career', 'health', 'love']);
    const { lunarMonthContext } = await import('../../lib/ai/lunar-month-context');
    const question = 'Tháng 9 âm 2026 cần lưu ý gì về công việc?';
    const month = lunarMonthContext(chart, [{ role: 'user', content: question }]);
    assert.ok(month && '流月命宫' in month);
    assert.equal(month.流月命宫.地支, '戌');
    assert.equal(month.流年.命宫地支, '午');
    assert.equal(month.流年.四化.length, 4);
    assert.ok(month.所问年大限);
    const monthly = await knowledgeBlock(chart, question, undefined, month);
    assert.ok(monthly.text.includes('月度原文测试，须核对条件。'));
    assert.ok(monthly.text.includes('本命提醒（并非流月断语）'));
    assert.ok(monthly.text.length <= 8000);
    const summary = await knowledgeBlock(chart, 'Công việc ra sao?', undefined, undefined, true);
    assert.equal(summary.stats.dataset.dims.length, DATASET_DIMS.length);
    console.log('interpret-general passed');
  } finally {
    process.chdir(cwd);
    await rm(tmp, { recursive: true, force: true });
  }
}
void main();
