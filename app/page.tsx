'use client';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';

export default function ChatInterface() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let storedId = localStorage.getItem('portfolio_chat_id');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('portfolio_chat_id', storedId);
    }
    setChatId(storedId);
  }, []);

  const { messages, sendMessage, setMessages, status } = useChat();
  const isLoading = status === 'submitted' || status === 'streaming';

  useEffect(() => {
    if (!chatId) return;

    setIsFetchingHistory(true);
    fetch(`/api/history?chatId=${chatId}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const text = await res.text();
        return text ? JSON.parse(text) : {};
      })
      .then((data) => {
        if (data.messages && data.messages.length > 0) {
          setMessages(data.messages);
        }
      })
      .catch((err) => console.error('Failed to load history:', err))
      .finally(() => {
        setIsFetchingHistory(false);
      });
  }, [setMessages, chatId]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading || !chatId) return;

    const text = input;
    setInput('');
    await sendMessage({ text }, { body: { chatId } });
  };

  const clearChat = async () => {
    if (!chatId || messages.length === 0) return;

    const confirmClear = window.confirm('Are you sure you want to clear the chat history?');
    if (!confirmClear) return;

    setMessages([]);

    try {
      await fetch(`/api/history?chatId=${chatId}`, { method: 'DELETE' });
    } catch (error) {
      console.error('Failed to clear chat history from database:', error);
    }
  };

  if (!chatId) return null;

  return (
    <div className="max-w-3xl mx-auto p-6 flex flex-col h-[80vh] bg-black text-blue-50 font-sans border border-blue-900 shadow-[0_0_15px_#1e3a8a] rounded-xl mt-10">
      <div className="flex justify-between items-center mb-6 border-b border-blue-900/50 pb-4">
        <h1 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]">
          Vishnu's AI Assistant
        </h1>
        <button
          onClick={clearChat}
          disabled={messages.length === 0 || isLoading || isFetchingHistory}
          className="text-sm px-4 py-2 rounded-lg bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 hover:text-red-300 transition-all disabled:opacity-30"
        >
          Clear Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto space-y-4 mb-6 p-4 rounded-lg bg-gray-950/50 border border-blue-900/50">
        {isFetchingHistory ? (
          <div className="space-y-6 w-full animate-pulse mt-2">
            <div className="p-4 rounded-lg bg-gray-900/50 border border-gray-800 max-w-[85%]">
              <div className="h-4 bg-gray-700/50 rounded w-16 mb-4"></div>
              <div className="space-y-3">
                <div className="h-3 bg-gray-800 rounded w-full"></div>
                <div className="h-3 bg-gray-800 rounded w-5/6"></div>
              </div>
            </div>
          </div>
        ) : messages.length === 0 && !isLoading ? (
          <div className="text-center text-blue-500/50 mt-10">
            Start a conversation with the AI.
          </div>
        ) : (
          messages.map((m, i) => (
            <div
              key={m.id || i}
              className={`p-4 rounded-lg text-sm leading-relaxed ${
                m.role === 'user'
                  ? 'bg-blue-950 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)] text-white ml-auto max-w-[85%]'
                  : 'bg-gray-900 border border-gray-800 text-blue-100 max-w-[85%]'
              }`}
            >
              <strong className={m.role === 'user' ? 'text-blue-300' : 'text-cyan-400'}>
                {m.role === 'user' ? 'You: ' : 'AI: '}
              </strong>
              <span className="whitespace-pre-wrap">
                {m.parts
                  ? m.parts
                      .filter((part) => part.type === 'text')
                      .map((part, idx) => <span key={idx}>{part.text}</span>)
                  : (m as { content?: string }).content}
              </span>
            </div>
          ))
        )}

        {isLoading && !isFetchingHistory && (
          <div className="text-blue-500 text-sm animate-pulse">Processing...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <form onSubmit={handleSubmit} className="flex gap-3">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask my AI anything..."
          className="flex-1 p-3 bg-gray-900 border border-blue-800 rounded-lg focus:outline-none focus:border-blue-400 focus:shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all text-white placeholder-blue-700"
          disabled={isLoading || isFetchingHistory}
        />
        <button
          type="submit"
          disabled={isLoading || isFetchingHistory || !input.trim()}
          className="bg-blue-600 text-white px-6 py-3 rounded-lg hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.6)] disabled:opacity-50 transition-all font-medium"
        >
          Send
        </button>
      </form>
    </div>
  );
}