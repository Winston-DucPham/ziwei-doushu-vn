import type { ZiweiChart } from '@/lib/ziwei/types';
import { viPalace } from '@/lib/i18n/vi';
import { DATASET_DIMS, lookupDataset, type DatasetRow, type DatasetDim } from '@/lib/ai/dataset-v4';
import type { lunarMonthContext } from './lunar-month-context';
import type { Trace, Observation } from '@/lib/ai/trace';

const BUDGET_DATASET_PER_DIM = 4000;
const BUDGET_DATASET_TOTAL = 8000;

/** Tên cung gốc không có chữ 宫, gộp 仆役/交友. */
const base = (name: string) => name.replace(/宫$/, '').replace('仆役', '交友');

/** Từ khóa tiếng Việt trong câu hỏi → cung (tên Hán gốc). */
const QUESTION_PALACES: [RegExp, string][] = [
  [/cung mệnh|mệnh cách|chủ mệnh|cách cục/i, '命'],
  [/huynh đệ|anh chị em|anh em|đối tác|hợp tác/i, '兄弟'],
  [/phu thê|tình cảm|tình yêu|hôn nhân|vợ|chồng|người yêu|kết hôn|cưới|ly hôn/i, '夫妻'],
  [/tử tức|con cái|sinh con|con tôi|con của|cấp dưới/i, '子女'],
  [/tài bạch|tài vận|tiền|thu nhập|giàu|tài chính|đầu tư/i, '财帛'],
  [/tật ách|sức khỏe|bệnh|ốm|tai nạn|phẫu thuật/i, '疾厄'],
  [/thiên di|đi xa|xuất ngoại|di chuyển|định cư|ra ngoài/i, '迁移'],
  [/nô bộc|bạn bè|quý nhân|tiểu nhân|giao hữu/i, '交友'],
  [/quan lộc|sự nghiệp|công việc|nghề|đổi việc|thăng chức|kinh doanh|khởi nghiệp/i, '官禄'],
  [/điền trạch|nhà|đất|bất động sản/i, '田宅'],
  [/phúc đức|tinh thần|phúc phần/i, '福德'],
  [/phụ mẫu|cha mẹ|bố mẹ|giấy tờ|hợp đồng/i, '父母'],
];

/** Cung → chủ đề trong dataset v4. */
const PALACE_DIM: Record<string, DatasetDim> = {
  '命': 'overview', '兄弟': 'family', '夫妻': 'love', '子女': 'children', '财帛': 'wealth', '疾厄': 'health',
  '迁移': 'move', '交友': 'friends', '官禄': 'career', '田宅': 'home', '福德': 'spirit', '父母': 'parents',
};
const DIM_LABEL: Record<DatasetDim, string> = {
  overview: 'Tổng quan mệnh cách', personality: 'Tính cách', love: 'Tình cảm', career: 'Sự nghiệp',
  wealth: 'Tài vận', health: 'Sức khỏe', family: 'Huynh đệ', children: 'Con cái', move: 'Thiên di',
  friends: 'Bạn bè', home: 'Điền trạch', spirit: 'Phúc đức', parents: 'Cha mẹ',
};

function datasetDims(chart: ZiweiChart, question: string): DatasetDim[] {
  const palaces = new Set<string>();
  for (const [pattern, palace] of QUESTION_PALACES) {
    if (pattern.test(question)) palaces.add(palace);
  }
  for (const palace of chart.palaces) {
    if (question.includes(viPalace(palace.name))) palaces.add(base(palace.name));
  }
  const dims: DatasetDim[] = [];
  if (/tính cách/i.test(question)) dims.push('personality');
  for (const palace of palaces) {
    const dim = PALACE_DIM[palace];
    if (dim && !dims.includes(dim) && !(dim === 'overview' && dims.includes('personality'))) dims.push(dim);
  }
  dims.sort((a, b) => Number(a === 'overview') - Number(b === 'overview'));
  return dims.length ? dims : [...DATASET_DIMS];
}

interface TraceCtx { trace: Trace; parent: Observation }

type MonthContext = ReturnType<typeof lunarMonthContext>;

// Search the entire matching row before normal topic excerpts are truncated.
function monthlyPassages(row: DatasetRow, preferred: DatasetDim[], month: NonNullable<MonthContext>) {
  const monthly = /流月|月限|斗君|月运|月運|流月四化|lưu nguyệt/i;
  const candidates = [];
  const overlays = '四化' in month ? month.四化 : '初一至十五' in month
    ? [...month.初一至十五.四化, ...month.十六至月底.四化] : [];
  for (const dim of DATASET_DIMS) {
    let heading = '';
    for (const block of (row.c[dim] ?? '').split(/\n\s*\n/)) {
      const lines = block.trim().split('\n');
      if (/^(?:#{1,6}\s|\*\*【)/.test(lines[0])) heading = lines.shift()!;
      const body = lines.join('\n').trim();
      if (!body || !monthly.test(heading + body)) continue;
      const excerpt = [heading, body].filter(Boolean).join('\n');
      const matches = overlays.filter(item => excerpt.includes(item.星)).length;
      const score = matches * 2 + Number(preferred.includes(dim)) + Number(monthly.test(body));
      candidates.push({ dim, excerpt, score });
    }
  }
  return candidates.sort((a, b) => b.score - a.score);
}

export async function knowledgeBlock(chart: ZiweiChart, question: string, tr?: TraceCtx, month?: MonthContext, summary = false) {
  const span = tr?.trace.span('knowledge.dataset-v4', { parent: tr.parent });
  const lookup = await lookupDataset(chart);
  const wantedDims = datasetDims(chart, question);
  const usedDims: DatasetDim[] = [];
  const sections: string[] = [];
  let monthlyChars = 0;
  if (month && !month.状态 && lookup.row) {
    const seen = new Set<string>();
    for (const { dim, excerpt } of monthlyPassages(lookup.row, wantedDims, month)) {
      const section = `[Dataset v4 · ${DIM_LABEL[dim]}]
${excerpt}`;
      if (seen.has(excerpt) || monthlyChars + section.length + 2 > BUDGET_DATASET_TOTAL / 2) continue;
      seen.add(excerpt);
      sections.push(section);
      monthlyChars += section.length + 2;
      if (!usedDims.includes(dim)) usedDims.push(dim);
    }
  }
  // A natal caution stays useful as background when a month-specific interpretation is absent.
  // Pick it from the topic of the actual monthly palace, preserving its original wording.
  if (month && lookup.row) {
    const flows = '流月命宫' in month ? [month] : '初一至十五' in month ? [month.初一至十五, month.十六至月底] : [];
    const dims = new Set(flows.map(f => PALACE_DIM[base(f.流月命宫.本命宫 ?? '')]).filter(Boolean));
    for (const dim of dims) {
      const paragraphs = lookup.row.c[dim]?.split(/\n\s*\n/) ?? [];
      const advice = paragraphs.find(p => p.length <= 1000 && /建议|提醒|留意|注意|不要急/.test(p) && !p.trim().startsWith('#') && !p.trim().startsWith('**'));
      if (!advice) continue;
      const section = `[Dataset v4 · ${DIM_LABEL[dim]}] 本命提醒（并非流月断语）\n${advice}`;
      sections.push(section);
      monthlyChars += section.length + 2;
      if (!usedDims.includes(dim)) usedDims.push(dim);
    }
  }
  const dimsToRead = summary ? [...new Set([...wantedDims, ...DATASET_DIMS])] : wantedDims;
  const topics = dimsToRead.flatMap(dim => {
    const source = lookup.row?.c[dim]?.trim();
    return source ? [{ dim, source }] : [];
  });
  // A broad question gets an excerpt from each available topic in this chart's row.
  // Share the same context budget across topics, including their citation labels.
  const perTopicBudget = Math.floor((BUDGET_DATASET_TOTAL - monthlyChars) / Math.max(topics.length, 1));
  for (const { dim, source } of topics) {
    const label = `[Dataset v4 · ${DIM_LABEL[dim]}]`;
    const budget = Math.min(BUDGET_DATASET_PER_DIM, perTopicBudget - label.length - 3);
    // Keep complete lines so truncation cannot drop a qualification mid-sentence.
    let excerpt = source;
    if (source.length > budget) {
      const prefix = source.slice(0, budget);
      const end = Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('。') + 1);
      excerpt = prefix.slice(0, end).trim();
    }
    if (!excerpt) continue;
    if (!usedDims.includes(dim)) usedDims.push(dim);
    sections.push(`${label}\n${excerpt}`);
  }
  const text = sections.length ? sections.join('\n\n') : '此问题没有可用的数据集原文。只能列出命盘事实，涉及解读时说明依据不足。';
  const stats = { dataset: { key: lookup.key, source: lookup.source, dims: usedDims, chars: sections.join('\n\n').length }, totalChars: text.length };
  span?.end({
    output: { hit: !!lookup.row, chars: stats.dataset.chars },
    metadata: { key: lookup.key, source: lookup.source, wantedDims, usedDims, monthlyChars },
    level: lookup.source === 'error' ? 'ERROR' : sections.length ? 'DEFAULT' : 'WARNING',
  });
  return { text, stats };
}
