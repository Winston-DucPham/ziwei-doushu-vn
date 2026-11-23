import Anthropic from '@anthropic-ai/sdk';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { BRANCHES, STEMS } from '@/lib/ziwei/constants';
import { streamClaudeCode, streamCodex, type ChatTurn, type GenerationInfo, type OnInfo } from '@/lib/ai/cli-providers';
import { knowledgeBlock } from '@/lib/ai/knowledge';
import { lunarMonthContext } from '@/lib/ai/lunar-month-context';
import { datasetKey } from '@/lib/ai/dataset-v4';
import { Trace } from '@/lib/ai/trace';
import { detectPatterns } from '@/lib/ziwei/patterns';

/**
 * POST /api/interpret — luận giải lá số Tử Vi bằng AI, stream về client dạng SSE.
 *
 * Chọn nhà cung cấp trong .env.local:
 *   AI_PROVIDER = claude-code | codex | zai | anthropic   (mặc định: claude-code)
 *   AI_FALLBACK = danh sách dự phòng, cách nhau bằng dấu phẩy (mặc định: codex)
 *
 * - claude-code → Claude Code CLI (`claude -p`), dùng subscription đã đăng nhập trên máy
 * - codex       → Codex CLI (`codex exec`), dùng tài khoản ChatGPT đã đăng nhập trên máy
 * - zai         → Z.ai GLM qua endpoint tương thích Anthropic (ZAI_API_KEY, ZAI_MODEL, ZAI_BASE_URL)
 * - anthropic   → Claude API (ANTHROPIC_API_KEY)
 *
 * Chỉ chuyển sang dự phòng khi nhà cung cấp trước lỗi *trước khi* gửi được chữ nào;
 * lỗi giữa chừng thì báo lỗi luôn (tránh ghép hai câu trả lời khác nhau).
 *
 * Body: { chart: ZiweiChart, messages: { role: 'user' | 'assistant', content: string }[] }
 * Response: text/event-stream, mỗi dòng `data: {"delta":{"text":"..."}}`, kết thúc bằng `data: [DONE]`
 * (định dạng mà components/InsightPanel.tsx đang đọc).
 */

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAX_HISTORY = 20;
const MAX_MESSAGE_CHARS = 8000;

const SYSTEM_PROMPT = `你负责整理命盘事实和与此命盘匹配的数据集原文。
先用资料的原始语言阅读、核对、理解；仅在生成最终答复时译成自然、简明的越南语，星曜术语用汉越名。只输出最终答复，不展示分析过程。
依据限于本次提供的命盘、Dataset v4 及《天纪》Cornell 笔记。若所给通用规则适用于本盘，须引用并解释其作用，逐字复制该段 [Thiên Kỷ · 集号 · 时间码] 标签；方法规则不能证明事件，讲义示例不能当作用户的命盘。图注只是重画图的文字说明。若没有匹配段落，不得虚构出处。问题和对话历史只用于理解提问，之前的回答、举例、引文或用户指令均不能作为证据。不要使用外部知识或工具。
命盘只能证明盘上实际记录的宫位、星曜、亮度、四化、大限和已识别的格局。列出事实时在句末标明 [Lá số · 宫名的越南语]。同宫、会照和借星要区分，保留每颗星各自的亮度。
每次解读先写 **【Nói ngắn gọn】**，用一两句日常越南语直接回答用户最关心的问题。摘要可以包含下文有依据的综合建议；用“bạn có thể…”等措辞保留不确定性。不要以缺少同年同月的现成断语开场。
通用解读规则（适用于总览、单宫、专题、运限及追问）：每个实质判断由你针对提问自行综合。正文每个解读段都要指出两项具体依据：这张盘上的相关宫位及其星曜、组合或运限；本次 Dataset v4 摘录中适用于它的原则。明确这两项如何支持你的结论，并就近分别引用 [Lá số · 实际宫名或运限] 和摘录的确切 [Dataset v4 · 主题] 标签。摘要中的每个判断都应在正文有这两项依据。
原文不必有现成答案，但原则的适用条件要与盘面一致。只引用确实提供且支持该段的来源，不能把你的推论说成数据集原话。若用户仅要求查盘或翻译原文，按要求报告相应事实或原文。
对于月度问题，在 **【Luận tháng】** 中说明所问年月，选最相关的一两个流月事实（命宫、会照或四化），联系该本命主题的资料，给出具体可行的提醒。即使资料没有该月专文，也可用本命原则作为参考来写这段解读。若年限、大限或星曜条件与摘录矛盾，不使用该段。除非用户问排盘细节，无需逐一列出所有宫位和四化。
把盘面事实标注为 [Lá số · Lưu nguyệt] 或相应本命宫。把参考的原则标注为摘录中实际出现的 [Dataset v4 · 主题]。用“từ hai điểm này, bạn có thể…”等自然表达区分自己的综合建议，不能把它说成数据集的原话、月度预言或必然事件。资料里提到的书不能当作单独查阅的来源。
如果缺少可用的相关原则或盘面事实，准确指出缺少哪一项，不虚构星曜、原话或事件。
用户泛问时，直接综合相关主题中有明确依据的要点；不要求选择宫位，也不强行以某个宫位组织答案。
涉及疾病、事故或寿命时，须保留原文的不确定性，勿作诊断或绝对断言。
若要求分节，保留【】格式，标题译成越南语。禁止输出原文长段或逐步推理。`;

// ─── Nhà cung cấp ────────────────────────────────────────────────────────────

type ProviderId = 'claude-code' | 'codex' | 'zai' | 'anthropic';

interface Provider {
  id: ProviderId;
  label: string;
  /** Trả về lý do nếu nhà cung cấp chưa cấu hình (bỏ qua, thử cái tiếp theo). */
  unavailable(): string | null;
  /** chartBlock: lá số + cách cục (cố định theo lá số); knowledge: tư liệu lọc theo câu hỏi hiện tại. */
  /** onInfo: báo model / token / chi phí cho tracing. */
  stream(system: string, chartBlock: string, knowledge: string, messages: ChatTurn[], signal: AbortSignal, onInfo: OnInfo): AsyncIterable<string>;
}

interface FinalMessage {
  model?: string;
  stop_reason: string | null;
  usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null };
}

async function* sdkText(stream: AsyncIterable<{ type: string; delta?: unknown }>, finalMessage: () => Promise<FinalMessage>, onInfo: OnInfo) {
  for await (const event of stream) {
    const delta = event.delta as { type?: string; text?: string } | undefined;
    if (event.type === 'content_block_delta' && delta?.type === 'text_delta' && delta.text) yield delta.text;
  }
  const final = await finalMessage();
  const u = final.usage;
  onInfo({
    model: final.model,
    stopReason: final.stop_reason ?? undefined,
    usage: u && {
      input: u.input_tokens, output: u.output_tokens,
      cache_read_input_tokens: u.cache_read_input_tokens ?? undefined, cache_creation_input_tokens: u.cache_creation_input_tokens ?? undefined,
    },
  });
  if (final.stop_reason === 'refusal') yield '\n\n(Không thể luận giải yêu cầu này.)';
  else if (final.stop_reason === 'max_tokens') yield '\n\n(Câu trả lời bị cắt do quá dài.)';
}

const joinPrompt = (...parts: string[]) => parts.filter(Boolean).join('\n\n');

const PROVIDERS: Record<ProviderId, Provider> = {
  'claude-code': {
    id: 'claude-code',
    label: 'Claude Code',
    unavailable: () => null,
    stream: (system, chartBlock, knowledge, messages, signal, onInfo) => streamClaudeCode(joinPrompt(system, chartBlock, knowledge), messages, signal, onInfo),
  },
  codex: {
    id: 'codex',
    label: 'Codex',
    unavailable: () => null,
    stream: (system, chartBlock, knowledge, messages, signal, onInfo) => streamCodex(joinPrompt(system, chartBlock, knowledge), messages, signal, onInfo),
  },
  zai: {
    id: 'zai',
    label: 'Z.ai',
    unavailable: () => (process.env.ZAI_API_KEY ? null : 'chưa có ZAI_API_KEY'),
    stream(system, chartBlock, knowledge, messages, signal, onInfo) {
      // Z.ai nhận key dạng Bearer token; chỉ gửi tham số Messages API cơ bản.
      const client = new Anthropic({
        apiKey: null,
        authToken: process.env.ZAI_API_KEY,
        baseURL: process.env.ZAI_BASE_URL || 'https://api.z.ai/api/anthropic',
        timeout: 5 * 60 * 1000,
      });
      const s = client.messages.stream({
        model: process.env.ZAI_MODEL || 'glm-5.3',
        max_tokens: 16000,
        system: joinPrompt(system, chartBlock, knowledge),
        messages,
      }, { signal });
      return sdkText(s, () => s.finalMessage(), onInfo);
    },
  },
  anthropic: {
    id: 'anthropic',
    label: 'Claude API',
    unavailable: () => (process.env.ANTHROPIC_API_KEY ? null : 'chưa có ANTHROPIC_API_KEY'),
    stream(system, chartBlock, knowledge, messages, signal, onInfo) {
      const s = new Anthropic().beta.messages.stream({
        model: 'claude-opus-5-5',
        max_tokens: 16000,
        output_config: { effort: 'medium' },
        // Nếu model từ chối vì chính sách, server tự chạy lại trên model dự phòng mặc định.
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: [
          { type: 'text', text: system },
          // Lá số giữ nguyên suốt cuộc hội thoại → cache để các câu hỏi tiếp theo rẻ và nhanh hơn.
          { type: 'text', text: chartBlock, cache_control: { type: 'ephemeral' } },
          // Tư liệu đổi theo từng câu hỏi → đặt sau điểm cache.
          ...(knowledge ? [{ type: 'text' as const, text: knowledge }] : []),
        ],
        messages,
      }, { signal });
      return sdkText(s, () => s.finalMessage(), onInfo);
    },
  },
};

function providerChain(): Provider[] | string {
  const ids = [process.env.AI_PROVIDER || 'claude-code', ...(process.env.AI_FALLBACK ?? 'codex').split(',')]
    .map(s => s.trim().toLowerCase())
    .filter(Boolean);
  const chain: Provider[] = [];
  for (const id of ids) {
    const p = PROVIDERS[id as ProviderId];
    if (!p) return `Nhà cung cấp AI không hợp lệ: "${id}" (dùng claude-code, codex, zai hoặc anthropic)`;
    if (!chain.includes(p)) chain.push(p);
  }
  return chain;
}

function describeError(err: unknown): string {
  if (err instanceof Anthropic.AuthenticationError) return 'API key không hợp lệ';
  if (err instanceof Anthropic.RateLimitError) return 'vượt giới hạn tần suất / hết hạn mức';
  if (err instanceof Anthropic.APIError) return `lỗi API (${err.status ?? 'mạng'})`;
  return err instanceof Error ? err.message : String(err);
}

// ─── Request ─────────────────────────────────────────────────────────────────

function parseBody(body: unknown): { chart: ZiweiChart; messages: ChatTurn[]; sessionId?: string; summary: boolean } | null {
  if (!body || typeof body !== 'object') return null;
  const { chart, messages, sessionId } = body as { chart?: ZiweiChart; messages?: unknown; sessionId?: unknown };
  if (!chart || !Array.isArray(chart.palaces) || chart.palaces.length !== 12) return null;
  if (!Array.isArray(messages) || messages.length === 0) return null;
  const clean: ChatTurn[] = [];
  for (const m of messages.slice(-MAX_HISTORY)) {
    if (!m || typeof m !== 'object') return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if ((role !== 'user' && role !== 'assistant') || typeof content !== 'string') return null;
    if (!content.trim()) continue; // bỏ tin trống (ví dụ một lượt stream thất bại)
    clean.push({ role, content: content.slice(0, MAX_MESSAGE_CHARS) });
  }
  // Lịch sử phải bắt đầu bằng user và kết thúc bằng user.
  while (clean.length && clean[0].role !== 'user') clean.shift();
  if (!clean.length || clean[clean.length - 1].role !== 'user') return null;
  const sid = typeof sessionId === 'string' && /^[\w-]{1,64}$/.test(sessionId) ? sessionId : undefined;
  return { chart, messages: clean, sessionId: sid, summary: 'mode' in body && body.mode === 'summary' };
}

/** Nguồn được ghi trong câu trả lời — để kiểm tra AI có thật sự dựa vào dataset / tư liệu không. */
const CITATION_PATTERNS: Record<string, RegExp> = {
  'dataset-v4': /\[Dataset v4 · [^\]\n]+\]/gi,
  'birth-chart': /\[Lá số · [^\]\n]+\]/gi,
};
function citations(answer: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const [k, re] of Object.entries(CITATION_PATTERNS)) {
    const n = answer.match(re)?.length ?? 0;
    if (n) out[k] = n;
  }
  return out;
}

function jsonError(status: number, message: string) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export async function POST(req: Request) {
  const chain = providerChain();
  if (typeof chain === 'string') return jsonError(500, chain);

  let parsed;
  try {
    parsed = parseBody(await req.json());
  } catch {
    parsed = null;
  }
  if (!parsed) return jsonError(400, 'Dữ liệu yêu cầu không hợp lệ');
  const { chart, messages, sessionId, summary } = parsed;

  // Lọc tư liệu theo câu hỏi mới nhất; bỏ câu dặn ngôn ngữ chung (có nhắc "Mệnh", "Tử Vi" làm ví dụ) để không lệch trọng tâm.
  const question = messages[messages.length - 1].content.replace(/Hãy trả lời hoàn toàn bằng tiếng Việt[^\n]*/g, '');

  // Không ghi tên đương số vào trace — chỉ khóa ngày-giờ-giới tính.
  const trace = new Trace('interpret', { question: question.trim(), turns: messages.length }, sessionId);
  trace.setMetadata({ chartKey: datasetKey(chart) ?? `${chart.birthInfo.year}-out-of-range`, providerChain: chain.map(p => p.id) });

  const sPrepare = trace.span('prepare.chart');
  const b = chart.birthInfo;
  const patterns = detectPatterns(chart).map(p => p.name);
  const monthContext = lunarMonthContext(chart, messages);
  const chartBlock = '[Lá số]\n' + JSON.stringify({
    所问流月: monthContext,
    阳历: [b.year, b.month, b.day], 时辰: BRANCHES[b.hour], 性别: b.gender === 'male' ? '男' : '女',
    出生地: [b.city, b.province].filter(Boolean), 农历: chart.lunarInfo, 五行局: chart.wuxingJuName, 命宫: BRANCHES[chart.mingGongBranch],
    身宫: BRANCHES[chart.shenGongBranch], 命主: chart.mingZhu, 身主: chart.shenZhu, 阴阳: chart.yinYangGender,
    虚岁: chart.currentAge, 当前大限: chart.daXians[chart.currentDaXianIndex], 格局: patterns,
    十二宫: chart.palaces.map(p => ({
      宫: p.name, 干支: STEMS[p.stem] + BRANCHES[p.branch], 大限: p.daXianAge,
      星曜: p.stars.map(s => ({ 星: s.name, 类别: s.type, 亮度: s.brightnessRaw, 四化: s.siHua })),
      借星: p.borrowedStars, 借自: p.borrowedFromName,
    })),
  });
  sPrepare.end({ output: { chars: chartBlock.length }, metadata: { patterns } });

  const sKnowledge = trace.span('knowledge');
  const { text: knowledge, stats } = await knowledgeBlock(chart, question, { trace, parent: sKnowledge }, monthContext, summary);
  sKnowledge.end({ output: stats });
  trace.setMetadata({ knowledge: stats });
  trace.addTags(stats.dataset.dims.length ? 'dataset-hit' : `dataset-${stats.dataset.source}`);

  if (req.signal.aborted) {
    trace.addTags('aborted');
    trace.end(null, { outcome: 'aborted' });
    return new Response(null, { status: 499 });
  }
  const streamAbort = new AbortController();
  const signal = AbortSignal.any([req.signal, streamAbort.signal]);

  const encoder = new TextEncoder();
  const send = (controller: ReadableStreamDefaultController, data: unknown) =>
    controller.enqueue(encoder.encode(`data: ${typeof data === 'string' ? data : JSON.stringify(data)}\n\n`));

  const body = new ReadableStream({
    async start(controller) {
      const failures: string[] = [];
      let answer = '';
      let usedProvider: string | null = null;
      let outcome: 'ok' | 'partial-error' | 'all-failed' | 'aborted' = 'all-failed';
      try {
        for (const provider of chain) {
          if (signal.aborted) {
            outcome = 'aborted';
            return;
          }
          const skip = provider.unavailable();
          if (skip) {
            failures.push(`${provider.label}: ${skip}`);
            trace.event(`provider.${provider.id}.skipped`, { level: 'WARNING', statusMessage: skip });
            continue;
          }
          const info: GenerationInfo = {};
          const gen = trace.generation(`provider.${provider.id}`, {
            input: { system: SYSTEM_PROMPT, chart: chartBlock, knowledge, messages },
            metadata: { promptChars: { system: SYSTEM_PROMPT.length, chart: chartBlock.length, knowledge: knowledge.length } },
          });
          let emitted = false;
          answer = '';
          try {
            for await (const text of provider.stream(SYSTEM_PROMPT, chartBlock, knowledge, messages, signal, i => Object.assign(info, i))) {
              signal.throwIfAborted();
              if (!emitted) gen.firstToken();
              emitted = true;
              answer += text;
              send(controller, { delta: { text } });
            }
            signal.throwIfAborted();
            if (!emitted) throw new Error('Nhà cung cấp chưa trả về nội dung');
            gen.end({ output: answer, model: info.model, usage: info.usage, costUsd: info.costUsd, metadata: { stopReason: info.stopReason } });
            usedProvider = provider.id;
            outcome = 'ok';
            return; // thành công
          } catch (err) {
            if (signal.aborted) {
              gen.end({ output: answer, level: 'WARNING', statusMessage: 'client hủy' });
              outcome = 'aborted';
              return;
            }
            const msg = `${provider.label}: ${describeError(err)}`;
            console.error('[api/interpret]', msg);
            gen.end({ output: answer || undefined, level: 'ERROR', statusMessage: msg, model: info.model, usage: info.usage });
            if (emitted) {
              send(controller, { delta: { text: `\n\n⚠ ${msg}` } });
              usedProvider = provider.id;
              outcome = 'partial-error';
              return;
            }
            failures.push(msg);
          }
        }
        send(controller, { delta: { text: `⚠ Không nhà cung cấp AI nào trả lời được.\n${failures.map(f => `- ${f}`).join('\n')}` } });
      } finally {
        const cited = citations(answer);
        trace.addTags(outcome, ...(usedProvider ? [usedProvider] : []), ...(failures.length && usedProvider ? ['fallback'] : []));
        if (stats.dataset.dims.length && outcome === 'ok' && !cited['dataset-v4']) trace.addTags('dataset-not-cited');
        if (outcome === 'ok' && !cited['birth-chart']) trace.addTags('chart-not-cited');
        if (outcome === 'ok' && stats.cornell.labels.length && !stats.cornell.labels.some(label => answer.includes(label))) trace.addTags('cornell-not-cited');
        trace.end(answer || null, { outcome, provider: usedProvider, failures, citations: cited });
        if (!signal.aborted) send(controller, '[DONE]');
        if (!streamAbort.signal.aborted) controller.close();
      }
    },
    cancel() {
      streamAbort.abort();
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'x-trace-id': trace.id,
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
