'use client';
import { useState, useRef, useEffect } from 'react';
import { getSanFangSiZheng } from './ChartBoard';
import ReadingPending from './ReadingPending';
import { useReading } from './useReading';
import { motion, AnimatePresence } from 'framer-motion';
import type { ZiweiChart, Palace } from '@/lib/ziwei/types';
import type { TimeView } from './TimeNav';
import { viPalace, viStar, viSiHua } from '@/lib/i18n/vi';


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
  { key: 'summary', label: 'Tổng quan' },
  { key: 'palace', label: 'Luận cung' },
  { key: 'overview',     label: 'Mệnh cách' },
  { key: 'love',        label: 'Tình cảm' },
  { key: 'career',      label: 'Sự nghiệp' },
  { key: 'wealth',      label: 'Tài vận' },
  { key: 'health',      label: 'Sức khỏe' },
  { key: 'personality', label: 'Tính cách' },
] as const;

const TOPIC_PROMPTS: Record<string, string> = {
  overview: 'Hãy luận mệnh cách của tôi dựa trên cung Mệnh và các cung liên quan.',
  love: 'Từ cung Phu Thê và các sao liên quan, bạn luận thế nào về tình cảm của tôi?',
  career: 'Từ cung Quan Lộc, bạn luận thế nào về sự nghiệp của tôi?',
  wealth: 'Cung Tài Bạch và các sao liên quan gợi ý gì về tài vận của tôi?',
  health: 'Từ cung Tật Ách và nguyên tắc tham khảo trong dataset, có điểm nào về sức khỏe đáng lưu ý?',
  personality: 'Từ cung Mệnh và các sao liên quan, bạn luận thế nào về tính cách của tôi?',
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

export default function InsightPanel({ chart, selectedPalace, selectedSiHua }: InsightPanelProps) {
  const [active, setActive] = useState('summary');
  const [lastPalace, setLastPalace] = useState('palace');
  const [threads, setThreads] = useState<Record<string, string>>({ summary: '' });
  const isPalace = active === 'palace' || active.startsWith('palace-');

  function openThread(id: string, prompt = '') {
    setThreads(previous => id in previous ? previous : { ...previous, [id]: prompt });
    setActive(id);
  }

  useEffect(() => {
    if (!selectedPalace) return;
    const names = getSanFangSiZheng(selectedPalace.branch).map(branch =>
      viPalace(chart.palaces.find(p => p.branch === branch)!.name));
    const [main, opposite, first, second] = names;
    const id = `palace-${selectedPalace.branch}`;
    setLastPalace(id);
    openThread(id, `Luận cung ${main} của tôi: đối cung là ${opposite}, hai cung tam hợp là ${first} và ${second}. Đối chiếu sao và tứ hóa thực tế ở bốn cung với nguyên tắc trong Dataset v4 để giải thích các cung liên hệ với nhau thế nào.`);
  }, [chart, selectedPalace]);

  useEffect(() => {
    if (!selectedSiHua) return;
    const { starName, siHua, view } = selectedSiHua;
    const palace = chart.palaces.find(p => p.stars.some(s => s.name === starName));
    const id = `palace-hua-${starName}-${siHua}-${view}`;
    setLastPalace(id);
    openThread(id, `Dựa trên lá số và Dataset v4, luận ${viStar(starName)} Hóa ${viSiHua(siHua)} ${palace ? 'tại cung ' + viPalace(palace.name) : ''} trong ${view === 'daxian' ? 'đại hạn' : 'lưu niên'}.`);
  }, [chart, selectedSiHua]);

  return (
    <div className="flex flex-col h-[min(44rem,80dvh)] min-h-0 min-w-0 rounded-xl overflow-hidden card-glass">

      {/* ── Topic buttons ── */}
      <div className="flex-shrink-0 px-2 pt-2.5 pb-2" style={{ borderBottom: '1px solid var(--t-border)' }}>
        <div className="grid grid-cols-4 gap-1 sm:grid-cols-4">
          {TOPICS.map(t => {
            const isActive = t.key === 'palace' ? isPalace : active === t.key;
            return (
              <button
                key={t.key}
                onClick={() => openThread(t.key === 'palace' ? lastPalace : t.key, TOPIC_PROMPTS[t.key])}
                aria-pressed={isActive}
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

      {active === 'palace' && <p className="m-auto text-xs">Chọn một cung trên lá số để xem luận giải.</p>}
      {Object.entries(threads).filter(([id]) => id !== 'palace').map(([id, prompt]) => (
        <div key={id} hidden={id !== active} className="flex-1 min-h-0">
          <ReadingThread chart={chart} general={id === 'summary'} prompt={prompt} visible={id === active}
            title={id.startsWith('palace-') && !id.startsWith('palace-hua-')
              ? viPalace(chart.palaces.find(p => p.branch === Number(id.slice(7)))!.name) : undefined} />
        </div>
      ))}
    </div>
  );
}

function ReadingThread({ chart, general, prompt, visible, title }: {
  chart: ZiweiChart; general: boolean; prompt: string; visible: boolean; title?: string;
}) {
  const { messages, loading, send, stop } = useReading(chart, general ? 'summary' : 'focused');
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);
  useEffect(() => {
    if (!prompt || started.current) return;
    const timer = setTimeout(() => {
      if (send(prompt, true)) started.current = true;
    }, 0);
    return () => clearTimeout(timer);
  }, [prompt, send]);
  useEffect(() => {
    if (visible && scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, visible]);
  const handleSend = () => { if (send(input)) setInput(''); };

  return (
    <div className="flex h-full min-h-0 flex-col">
      {title && <h3 className="px-4 pt-2 text-sm font-medium">Luận cung {title}</h3>}
      {/* ── Messages ── */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain p-4 space-y-4 min-h-0">

        {/* Empty state — prompt user to click a topic or palace */}
        {messages.length === 0 && !loading && (
          <div className="flex flex-col items-center justify-center h-full text-center gap-2 px-4">
            <div className="text-4xl mb-1" style={{ color: 'var(--t-gold)', opacity: 0.08 }}>✦</div>
            <p className="text-[11px] font-medium" style={{ color: 'var(--t-text2)' }}>Bạn muốn xem điều gì trên lá số?</p>
            <p className="text-[10px]" style={{ color: 'var(--t-faint)' }}>
               {general ? 'Hỏi về toàn bộ lá số. Câu trả lời sẽ đối chiếu với Dataset v4.' : 'Chọn chủ đề hoặc nhấn vào một cung để xem chi tiết.'}
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

        {messages[messages.length - 1]?.stopped && (
          <p role="status" className="text-xs" style={{ color: 'var(--t-faint)' }}>Đã dừng trả lời.</p>
        )}
        {loading && messages[messages.length - 1]?.role === 'user' && <ReadingPending />}

      </div>

      {/* ── Input ── */}
      <div className="flex-shrink-0 px-3 pb-3 pt-2" style={{ borderTop: '1px solid var(--t-border)' }}>
        <div className="flex gap-2">
          <input
            type="text"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && !e.shiftKey && handleSend()}
            placeholder="Nhập câu hỏi, ví dụ: Tháng 9 âm tôi cần lưu ý gì?"
            disabled={loading}
            className="flex-1 rounded-lg px-3 py-2 text-[11px] focus:outline-none transition-colors"
            style={{
              background: 'var(--t-card)',
              border: '1px solid var(--t-border)',
              color: 'var(--t-text)',
            }}
          />
          <button
            onClick={loading ? stop : handleSend}
            disabled={!loading && !input.trim()}
            className="px-3 py-2 rounded-lg text-[11px] font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
            style={{
              background: 'rgba(212,168,67,0.15)',
              border: '1px solid rgba(212,168,67,0.25)',
              color: 'var(--t-gold)',
            }}
          >
            {loading ? 'Dừng' : 'Hỏi thêm'}
          </button>
        </div>
      </div>

    </div>
  );
}
