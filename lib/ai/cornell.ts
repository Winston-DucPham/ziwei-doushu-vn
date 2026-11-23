import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

interface Rule { label: string; text: string; visuals: string[] }

const clockSeconds = (time: string) => time.split(':').reduce((seconds, part) => seconds * 60 + Number(part), 0);

async function readEpisode(root: string, episode: string): Promise<Rule[]> {
  const dir = path.join(root, episode);
  const note = await readFile(path.join(dir, episode + '-康奈尔笔记.md'), 'utf8');
  const rules = note.split(/^\*\*通用规则\*\*\s*$/m)[1]?.split(/^\*\*|^## /m)[0] ?? '';
  const visuals: { start: number; end: number; caption: string }[] = [];
  // Only include redraws actually published alongside the notes.
  for (const row of note.split('\n')) {
    if (!row.startsWith('|') || !row.includes('<img ')) continue;
    const time = row.match(/\[(\d\d:\d\d:\d\d)/g);
    if (!time?.length) continue;
    for (const img of row.matchAll(/<img src="([^"]+)"[^>]* alt="([^"]+)"/g)) {
      visuals.push({ start: clockSeconds(time[0].slice(1)), end: clockSeconds(time[time.length - 1].slice(1)),
        caption: img[2] + ' (' + img[1] + ')' });
    }
  }
  for (const link of note.matchAll(/\]\((图\/命盘-[^()\n]+\.json)\)/g)) {
    const example = JSON.parse(await readFile(path.join(dir, link[1]), 'utf8'));
    for (const segment of example.视频段 ?? []) {
      visuals.push({ start: segment.起秒, end: segment.止秒, caption: '讲义命例（仅供示范）: ' + segment.命例 + ' (' + link[1] + ')' });
    }
  }
  const result: Rule[] = [];
  for (const line of rules.split('\n')) {
    const ref = line.match(/\[(\d\d:\d\d:\d\d)(?:[–—-](\d\d:\d\d:\d\d))?\]\(https:\/\/www\.bilibili\.com\//);
    if (!line.startsWith('- ') || !ref) continue;
    const start = clockSeconds(ref[1]), end = clockSeconds(ref[2] ?? ref[1]);
    result.push({ label: `[Thiên Kỷ · ${episode} · ${ref[1]}]`, text: line.slice(2),
      visuals: [...new Set(visuals.filter(v => v.start <= end && v.end >= start).map(v => v.caption))].slice(0, 2) });
  }
  return result;
}

let index: Promise<Rule[]> | undefined;
export async function cornellReferences(terms: Map<string, number>) {
  const root = path.join(process.cwd(), 'research/nishi-video-reading/康奈尔笔记');
  index ??= readdir(root).then(async entries =>
    (await Promise.all(entries.filter(name => /^P\d+$/.test(name)).sort().map(name => readEpisode(root, name)))).flat()
  ).catch(error => { index = undefined; throw error; });
  const rules = await index;
  return rules.map(rule => ({ rule, score: [...terms].reduce((sum, [word, weight]) =>
    sum + (rule.text.includes(word) ? weight : 0), 0) }))
    .filter(hit => hit.score > 0).sort((a, b) => b.score - a.score).slice(0, 4).map(hit => hit.rule);
}
