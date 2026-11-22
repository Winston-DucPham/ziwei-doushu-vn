'use client';
import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { TimeView } from './TimeNav';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
}

interface SelectedSiHua {
  starName: string;
  siHua: string;
  view: TimeView;
}

interface InsightPanelProps {
  chart: ZiweiChart;
  selectedPalace?: Palace | null;
  selectedSiHua?: SelectedSiHua | null;
}

const TOPICS = [
  { key: 'overview',     label: 'Mệnh cách' },
  { key: 'love',        label: 'Tình cảm' },
  { key: 'career',      label: 'Sự nghiệp' },
  { key: 'wealth',      label: 'Tài vận' },
  { key: 'health',      label: 'Sức khỏe' },
  { key: 'personality', label: 'Tính cách' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: `Dựa vào lá số và tư liệu dataset, hãy luận giải tổng quan mệnh cách theo cấu trúc sau:

**【Định tính mệnh cách】**
Một câu tóm tắt cốt lõi cách cục và khí chất của mệnh chủ.

**【Giải đọc chủ tinh】**
Đặc tính cốt lõi của chủ tinh tọa cung Mệnh — dẫn chứng nguyên văn hoặc quan điểm Nghê Hải Hạ.

**【Tam phương tứ chính】**
Phân tích liên hoàn ba cung Tài, Quan, Thiên Di và cách cục tổng thể.

**【Đại hạn hiện tại】**
Hướng vận đại hạn hiện tại và điều cần chú ý nhất.

**【Ưu thế và lưu ý】**
Thiên phú của lá số và những rủi ro hoặc bài học cần chú ý.`,

  love: `Dựa vào lá số và tư liệu dataset, hãy phân tích sâu về tình duyên hôn nhân theo cấu trúc sau:

**【Cách cục tình duyên】**
Một câu định tính cách cục tình duyên của lá số.

**【Phân tích cung Phu Thê】**
Chủ tinh, tứ hóa cung Phu Thê và cách giải đọc cụ thể trong hệ thống Nghê Hải Hạ.

**【Tam phương liên hoàn】**
Ảnh hưởng của các cung liên quan đến tình duyên.

**【Tình duyên đại hạn hiện tại】**
Hướng tình duyên 10 năm hiện tại và những thời điểm then chốt.

**【Lời khuyên thực tế】**
Lời khuyên tình duyên cụ thể, có thể thực hiện được.`,

  career: `Dựa vào lá số và tư liệu dataset, hãy phân tích sâu về sự nghiệp theo cấu trúc sau:

**【Cách cục sự nghiệp】**
Một câu định tính cách cục sự nghiệp — hợp đi làm hay tự kinh doanh.

**【Phân tích cung Quan Lộc】**
Chủ tinh, tứ hóa cung Quan Lộc và nhận định của Nghê Hải Hạ về cấu hình này.

**【Liên hoàn cung Tài Bạch】**
Mối quan hệ tài vận và sự nghiệp, phân tích nguồn thu.

**【Sự nghiệp đại hạn hiện tại】**
Hướng sự nghiệp 10 năm hiện tại.

**【Lời khuyên thực tế】**
Hướng đi, ngành nghề và chiến lược phù hợp.`,

  wealth: `Dựa vào lá số và tư liệu dataset, hãy phân tích sâu về tài vận theo cấu trúc sau:

**【Cách cục tài vận】**
Một câu định tính mô hình tài vận — tài chủ động hay bị động.

**【Phân tích cung Tài Bạch】**
Chủ tinh, tứ hóa cung Tài Bạch, nguồn tài và cách vận hành dòng tiền.

**【Cung Điền Trạch (kho tài)】**
Khả năng tích lũy và vận bất động sản.

**【Tài vận đại hạn hiện tại】**
Hướng tài vận hiện tại và những điều cần lưu ý.

**【Lời khuyên tài chính】**
Lời khuyên tài chính cụ thể.`,

  health: `Dựa vào lá số và tư liệu dataset, hãy phân tích sức khỏe theo cấu trúc sau:

**【Chủ tinh cung Tật Ách】**
Các sao cung Tật Ách và ý nghĩa sức khỏe.

**【Rủi ro chính】**
Kết hợp lý thuyết Tý Ngọ Lưu Chú của Nghê Hải Hạ, phân tích ẩn họa sức khỏe và bộ phận cần chú ý.

**【Xu hướng sức khỏe đại hạn】**
Xu hướng sức khỏe hiện tại và những thời điểm quan trọng.

**【Lời khuyên phòng ngừa】**
Những điều cụ thể cần chú ý và hướng dưỡng sinh.`,

  personality: `Dựa vào lá số và tư liệu dataset, hãy phân tích sâu về tính cách theo cấu trúc sau:

**【Tính cách chủ tinh cung Mệnh】**
Đặc tính tính cách cốt lõi của chủ tinh cung Mệnh — dẫn nguyên văn Nghê Hải Hạ.

**【Tổng hợp tam phương】**
Ảnh hưởng của Tài, Quan, Thiên Di đến tính cách — tranh toàn cảnh.

**【Mô hình quan hệ】**
Cách tương tác với người khác, phong cách ứng xử.

**【Ưu thế và bài học cuộc đời】**
Thiên phú bẩm sinh và những bài học cuộc đời cần đối mặt.`,
};

const PALACE_ROLES: Record<string, string> = {
  '命宫':   '自我、性格、先天格局',
  '兄弟宫': '兄弟关系、合伙人',
  '夫妻宫': '感情关系、婚姻状态',
  '子女宫': '子女缘分、下属关系',
  '财帛宫': '财运来源、收入方式',
  '疾厄宫': '身体健康、意外',
  '迁移宫': '外出机遇、人际格局',
  '交友宫': '朋友圈、贵人、小人',
  '官禄宫': '事业成就、社会地位',
  '田宅宫': '不动产、家庭环境',
  '福德宫': '精神享受、内心福分',
  '父母宫': '父母关系、文书契约',
};

/** Render AI markdown: **【Title】** → gold header, **bold** → strong */
function AiContent({ text, streaming }: { text: string; streaming?: boolean }) {
  const lines = text.split('\n');
  return (
    <div className="space-y-0.5">
      {lines.map((line, i) => {
        const sectionMatch = line.match(/^\*\*【(.+?)】\*\*$/);
        if (sectionMatch) {
          return (
            <div key={i} className="pt-3 pb-0.5 first:pt-0">
              <span className="text-[11px] font-semibold tracking-wide" style={{ color: 'var(--t-gold)' }}>
                【{sectionMatch[1]}】
              </span>
            </div>
          );
        }
        if (line.trim() === '') return <div key={i} className="h-1" />;
        const parts = line.split(/\*\*(.+?)\*\*/);
        return (
          <div key={i} className="text-[11px] leading-relaxed" style={{ color: 'var(--t-text2)' }}>
            {parts.map((part, j) =>
              j % 2 === 0
                ? part
                : <strong key={j} className="font-medium" style={{ color: 'var(--t-text)' }}>{part}</strong>
            )}
          </div>
        );
      })}
      {streaming && (
        <span
          className="inline-block w-1.5 h-3 ml-0.5 animate-pulse rounded-sm align-middle"
          style={{ background: 'var(--t-gold)', opacity: 0.6 }}
        />
      )}
    </div>
  );
}

function ThinkingBlock({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="mb-3"
    >
      <div
        className="text-[9px] tracking-widest mb-1.5 flex items-center gap-1.5"
        style={{ color: 'var(--t-faint)' }}
      >
        <span className="animate-pulse" style={{ color: 'var(--t-gold)', opacity: 0.5 }}>✦</span>
        Đang phân tích lá số…
      </div>
      {text && (
        <div
          className="relative rounded-lg px-2.5 py-2 max-h-16 overflow-hidden"
          style={{ background: 'rgba(212,168,67,0.04)', border: '1px solid rgba(212,168,67,0.1)' }}
        >
          <p className="text-[9px] leading-relaxed break-words" style={{ color: 'var(--t-faint)', fontStyle: 'italic' }}>
            {text.slice(-400)}
          </p>
          <div
            className="absolute bottom-0 left-0 right-0 h-5 rounded-b-lg"
            style={{ background: 'linear-gradient(to bottom, transparent, var(--t-card, #0a0a0a))' }}
          />
        </div>
      )}
    </motion.div>
  );
}

export default function InsightPanel({ chart, selectedPalace, selectedSiHua }: InsightPanelProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [activeTopic, setActiveTopic] = useState<string>('overview');
  const [thinkingText, setThinkingText] = useState('');
  const [isThinking, setIsThinking] = useState(false);
  const messagesRef = useRef<Message[]>([]);
  const loadingRef = useRef(false);
  const lastPalaceBranch = useRef<number | undefined>(undefined);
  const lastSiHuaKey = useRef<string | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { messagesRef.current = messages; }, [messages]);
  useEffect(() => { loadingRef.current = loading; }, [loading]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, thinkingText]);

  useEffect(() => {
    if (!selectedPalace || selectedPalace.branch === lastPalaceBranch.current) return;
    lastPalaceBranch.current = selectedPalace.branch;

    const majorStars = selectedPalace.stars.filter(s => s.type === 'major');
    const starDesc = majorStars.length > 0
      ? majorStars.map(s => `${s.name}${s.siHua ? ' Hóa ' + s.siHua : ''}`).join(', ')
      : 'không chủ tinh (mượn đối cung)';
    const role = PALACE_ROLES[selectedPalace.name] ?? '';

    const prompt = `Dựa vào lá số và tư liệu dataset, hãy phân tích trọng tâm【${selectedPalace.name}】（chủ quản: ${role}）, chủ tinh cung này là ${starDesc}. Xuất theo cấu trúc sau:

**【Định tính cung vị】**
Ý nghĩa của ${selectedPalace.name} trong lá số và nhận định tổng thể về cấu hình sao này.

**【Giải đọc chủ tinh】**
Giải đọc chủ tinh tại cung này theo hệ thống Nghê Hải Hạ — dẫn quan điểm cụ thể.

**【Liên hoàn tam phương tứ chính】**
Ảnh hưởng của các cung tam phương tứ chính đến cung ${selectedPalace.name}.

**【Lời khuyên thực tế】**
Lời khuyên cụ thể dựa trên cung này.`;

    sendMessage(prompt, true);
  }, [selectedPalace]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!selectedSiHua) return;
    const key = `${selectedSiHua.starName}-${selectedSiHua.siHua}-${selectedSiHua.view}`;
    if (key === lastSiHuaKey.current) return;
    lastSiHuaKey.current = key;

    const palaceOfStar = chart.palaces.find(p =>
      p.stars.some(s => s.name === selectedSiHua.starName)
    );
    const palaceName = palaceOfStar?.name ?? 'cung không xác định';
    const viewLabel = selectedSiHua.view === 'daxian' ? 'Đại hạn' : 'Lưu niên';

    const prompt = `Dựa vào lá số và tư liệu dataset, hãy phân tích ảnh hưởng phi hóa【${viewLabel} ${selectedSiHua.starName} Hóa ${selectedSiHua.siHua}】theo cấu trúc sau:

**【Ý nghĩa cơ bản Hóa ${selectedSiHua.siHua}】**
Ý nghĩa cốt lõi của Hóa ${selectedSiHua.siHua} trong hệ thống Nghê Hải Hạ và ý nghĩa đặc biệt của ${selectedSiHua.starName} Hóa ${selectedSiHua.siHua}.

**【Ảnh hưởng tại cung】**
${selectedSiHua.starName} Hóa ${selectedSiHua.siHua} tọa【${palaceName}】— lĩnh vực cung này chủ quản bị ảnh hưởng như thế nào, Nghê sư giải đọc ra sao.

**【Đường phi hóa tam phương tứ chính】**
Sau khi Hóa ${selectedSiHua.siHua} nhập ${palaceName}, ảnh hưởng liên hoàn đến tam phương tứ chính (đối cung và hai cung tam hợp).

**【Ảnh hưởng vận thế hiện tại】**
Trong chiều thời gian ${viewLabel}, phi hóa này ảnh hưởng cụ thể thế nào đến vận thế gần đây của mệnh chủ.

**【Lời khuyên thực tế】**
Lời khuyên cụ thể, có thể thực hiện được dựa trên tứ hóa này.`;

    sendMessage(prompt, true);
  }, [selectedSiHua]); // eslint-disable-line react-hooks/exhaustive-deps

  const streamResponse = async (apiMessages: { role: 'user' | 'assistant'; content: string }[]) => {
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chart, messages: apiMessages }),
      });
      if (res.status === 404) throw new Error('api-missing');
      if (!res.ok) throw new Error('Yêu cầu thất bại');
      if (!res.body) throw new Error('Không có luồng phản hồi');

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let assistantText = '';
      let textStarted = false;

      setIsThinking(true);
      setThinkingText('');

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value, { stream: true });
        for (const line of chunk.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6);
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data);
            if (parsed.delta?.thinking !== undefined) {
              setThinkingText(prev => prev + parsed.delta.thinking);
            } else if (parsed.delta?.text) {
              if (!textStarted) {
                textStarted = true;
                setIsThinking(false);
                setMessages(prev => [...prev, { role: 'assistant', content: '' }]);
              }
              assistantText += parsed.delta.text;
              setMessages(prev => {
                const updated = [...prev];
                updated[updated.length - 1] = { role: 'assistant', content: assistantText };
                return updated;
              });
            }
          } catch { /* skip */ }
        }
      }

      // If we never got text (e.g. empty response), add a placeholder
      if (!textStarted) {
        setMessages(prev => [...prev, { role: 'assistant', content: '…' }]);
      }
    } catch (e) {
      const missing = e instanceof Error && e.message === 'api-missing';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: missing
          ? 'Phiên bản mã nguồn mở không có API giải đọc AI (/api/interpret). Bạn cần tự triển khai — xem README "Bắt đầu nhanh".'
          : 'Giải đọc thất bại, vui lòng thử lại sau.',
      }]);
    } finally {
      setIsThinking(false);
      setThinkingText('');
      setLoading(false);
      loadingRef.current = false;
    }
  };

  const sendMessage = (text: string, hidden = false) => {
    if (!text.trim() || loadingRef.current) return;
    loadingRef.current = true;
    setLoading(true);

    const userMsg: Message = { role: 'user', content: text, hidden };
    const apiMessages = [...messagesRef.current, userMsg].map(m => ({
      role: m.role,
      content: m.content,
    }));

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    streamResponse(apiMessages);
  };

  const handleTopicClick = (topicKey: string) => {
    if (loadingRef.current) return;
    setActiveTopic(topicKey);
    sendMessage(TOPIC_PROMPTS[topicKey], true);
  };

  const handleSend = () => {
    sendMessage(input);
  };

  return (
    <div className="flex flex-col h-[min(44rem,80dvh)] min-h-0 min-w-0 rounded-xl overflow-hidden card-glass">

      {/* ── Topic buttons ── */}
      <div className="flex-shrink-0 px-2 pt-2.5 pb-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="grid grid-cols-6 gap-1">
          {TOPICS.map(t => {
            const isActive = activeTopic === t.key;
            return (
              <button
                key={t.key}
                onClick={() => handleTopicClick(t.key)}
                disabled={loading}
                className="py-1.5 text-[10px] font-medium rounded-lg transition-all duration-150 disabled:opacity-40"
                style={{
                  background: isActive ? 'rgba(212,168,67,0.12)' : 'transparent',
                  border: `1px solid ${isActive ? 'rgba(212,168,67,0.3)' : 'var(--t-border)'}`,
                  color: isActive ? 'var(--t-gold)' : 'var(--t-faint)',
                }}
              >
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">

        {/* Initial loading state — before any message or thinking */}
        {messages.length === 0 && !isThinking && loading && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="text-4xl mb-3" style={{ color: 'var(--t-gold)', opacity: 0.1 }}>✦</div>
            <p className="text-[10px] animate-pulse" style={{ color: 'var(--t-faint)' }}>Đang khởi tạo giải đọc…</p>
          </div>
        )}

        {/* Empty state — prompt user to click a topic or palace */}
        {messages.length === 0 && !loading && !isThinking && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <div className="text-4xl mb-1" style={{ color: 'var(--t-gold)', opacity: 0.08 }}>✦</div>
            <p className="text-[11px] font-medium" style={{ color: 'var(--t-text2)' }}>Chọn chủ đề để xem giải đọc</p>
            <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
              Nhấn vào tab phía trên hoặc click vào một cung trên lá số
            </p>
          </div>
        )}

        <AnimatePresence initial={false}>
          {messages.map((msg, i) => {
            if (msg.role === 'user' && msg.hidden) return null;

            if (msg.role === 'user') {
              return (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-end"
                >
                  <div
                    className="max-w-[85%] rounded-xl px-3 py-2 text-[11px]"
                    style={{
                      background: 'rgba(212,168,67,0.08)',
                      border: '1px solid rgba(212,168,67,0.18)',
                      color: 'var(--t-gold)',
                    }}
                  >
                    {msg.content}
                  </div>
                </motion.div>
              );
            }

            const isLastMsg = i === messages.length - 1;
            return (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
              >
                <div
                  className="text-[9px] tracking-widest mb-2 flex items-center gap-1.5"
                  style={{ color: 'var(--t-faint)' }}
                >
                  <span style={{ color: 'var(--t-gold)', opacity: 0.4 }}>✦</span>
                  Giải đọc mệnh lý
                </div>
                <AiContent text={msg.content} streaming={loading && isLastMsg} />
              </motion.div>
            );
          })}
        </AnimatePresence>

        {/* Thinking indicator — shown while AI is in thinking phase */}
        {isThinking && <ThinkingBlock text={thinkingText} />}

      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Hỏi thêm, ví dụ: Năm nay có hợp đổi việc không?"
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={handleSend}
            disabled={loading || !input.trim()}
            className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            {loading ? '…' : 'Hỏi thêm'}
          </button>
        </div>
      </div>

    </div>
  );
}
