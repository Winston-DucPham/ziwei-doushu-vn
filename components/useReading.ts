'use client';
import { useEffect, useRef, useState } from 'react';
import type { ZiweiChart } from '@/lib/ziwei/types';
import { readAnswer } from '@/lib/ai/read-answer';

interface Message {
  role: 'user' | 'assistant';
  content: string;
  hidden?: boolean;
  stopped?: boolean;
}

export function useReading(chart: ZiweiChart, mode: 'summary' | 'focused' = 'focused') {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(false);
  const active = useRef<AbortController | null>(null);

  useEffect(() => () => {
    active.current?.abort();
    active.current = null;
  }, []);

  function stop() {
    if (!active.current) return;
    active.current.abort();
    active.current = null;
    setLoading(false);
    setMessages(prev => [
      ...prev.slice(0, -1),
      { ...prev[prev.length - 1], stopped: true },
    ]);
  }

  function send(text: string, hidden = false) {
    if (!text.trim() || active.current) return false;
    const controller = new AbortController();
    active.current = controller;
    setLoading(true);
    const user: Message = { role: 'user', content: text, hidden };
    setMessages(prev => [...prev, user]);
    const history = [...messages.filter(m => !(m.stopped && m.role === 'user')), user]
      .map(({ role, content }) => ({ role, content }));
    void stream(controller, history);
    return true;
  }

  async function stream(controller: AbortController, history: Message[]) {
    try {
      const res = await fetch('/api/interpret', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({ chart, messages: history, mode }),
      });
      if (res.status === 404) throw new Error('api-missing');
      if (!res.ok || !res.body) throw new Error('Yêu cầu thất bại');

      let answer = '';
      for await (const delta of readAnswer(res.body)) {
        if (controller.signal.aborted) return;
        answer += delta;
        if (!answer.trim()) continue;
        const message: Message = { role: 'assistant', content: answer };
        setMessages(prev => prev[prev.length - 1]?.role === 'assistant'
          ? [...prev.slice(0, -1), message]
          : [...prev, message]);
      }
      if (!answer.trim()) throw new Error('Phản hồi trống');
    } catch (error) {
      if (controller.signal.aborted) return;
      const missing = error instanceof Error && error.message === 'api-missing';
      setMessages(prev => [...prev, {
        role: 'assistant',
        content: missing
          ? 'Chưa tìm thấy dịch vụ giải đọc (/api/interpret).'
          : 'Giải đọc thất bại, vui lòng thử lại sau.',
      }]);
    } finally {
      if (active.current === controller) {
        active.current = null;
        setLoading(false);
      }
    }
  }

  return { messages, loading, send, stop };
}
