/** Read the answer text from /api/interpret, retaining SSE lines split across chunks. */
export async function* readAnswer(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  try {
    while (true) {
      const { value, done } = await reader.read();
      const lines = (pending + decoder.decode(value, { stream: !done })).split('\n');
      pending = done ? '' : lines.pop()!;
      for (const line of lines) {
        if (!line.startsWith('data:')) continue;
        const payload = line.slice(5).trim();
        if (payload === '[DONE]') return;
        const text = JSON.parse(payload).delta?.text;
        if (typeof text === 'string' && text) yield text;
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
