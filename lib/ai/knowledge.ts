import type { ZiweiChart } from '@/lib/ziwei/types';
import { viPalace } from '@/lib/i18n/vi';
import { lookupDataset, type DatasetDim } from '@/lib/ai/dataset-v4';
import type { Trace, Observation } from '@/lib/ai/trace';

const BUDGET_DATASET_PER_DIM = 4000;
const MAX_DATASET_DIMS = 2;

/** Tên cung gốc không có chữ 宫, gộp 仆役/交友. */
const base = (name: string) => name.replace(/宫$/, '').replace('仆役', '交友');

/** Từ khóa tiếng Việt trong câu hỏi → cung (tên Hán gốc). */
const QUESTION_PALACES: [RegExp, string][] = [
  [/mệnh|tính cách|bản thân|cách cục/i, '命'],
  [/huynh đệ|anh chị em|anh em|đối tác|hợp tác/i, '兄弟'],
  [/phu thê|tình cảm|tình yêu|hôn nhân|vợ|chồng|người yêu|kết hôn|cưới|ly hôn/i, '夫妻'],
  [/tử tức|con cái|con\b|cấp dưới/i, '子女'],
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
  return dims.length ? dims.slice(0, MAX_DATASET_DIMS) : ['overview'];
}

interface TraceCtx { trace: Trace; parent: Observation }

export async function knowledgeBlock(chart: ZiweiChart, question: string, tr?: TraceCtx) {
  const span = tr?.trace.span('knowledge.dataset-v4', { parent: tr.parent });
  const lookup = await lookupDataset(chart);
  const wantedDims = datasetDims(chart, question);
  const usedDims: DatasetDim[] = [];
  const sections: string[] = [];
  for (const dim of wantedDims) {
    const source = lookup.row?.c[dim]?.trim();
    if (!source) continue;
    // Keep complete lines so truncation cannot drop a qualification mid-sentence.
    let excerpt = source;
    if (source.length > BUDGET_DATASET_PER_DIM) {
      const prefix = source.slice(0, BUDGET_DATASET_PER_DIM);
      const end = Math.max(prefix.lastIndexOf('\n'), prefix.lastIndexOf('。') + 1);
      excerpt = prefix.slice(0, end).trim();
    }
    if (!excerpt) continue;
    usedDims.push(dim);
    sections.push(`[Dataset v4 · ${DIM_LABEL[dim]}]\n${excerpt}`);
  }
  const text = sections.length ? sections.join('\n\n') : '此问题没有可用的数据集原文。只能列出命盘事实，涉及解读时说明依据不足。';
  const stats = { dataset: { key: lookup.key, source: lookup.source, dims: usedDims, chars: sections.join('\n\n').length }, totalChars: text.length };
  span?.end({
    output: { hit: !!lookup.row, chars: stats.dataset.chars },
    metadata: { key: lookup.key, source: lookup.source, wantedDims, usedDims },
    level: lookup.source === 'error' ? 'ERROR' : sections.length ? 'DEFAULT' : 'WARNING',
  });
  return { text, stats };
}
