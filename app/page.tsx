'use client';
import { useChat } from '@ai-sdk/react';
import { useEffect, useState, useRef } from 'react';
import { ImagePlus, Mic, Send, Trash2, Volume2, Square, X } from 'lucide-react';

interface SpeechRecognitionEventLike {
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionLike {
  lang: string;
  interimResults: boolean;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
}

type SpeechRecognitionConstructor = new () => SpeechRecognitionLike;

interface ToastState {
  message: string;
  type: 'info' | 'success' | 'error' | 'confirm';
  confirmLabel?: string;
  onConfirm?: () => void;
}

export default function ChatInterface() {
  const [chatId, setChatId] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [files, setFiles] = useState<FileList | undefined>(undefined);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [isFetchingHistory, setIsFetchingHistory] = useState(true);
  const [isListening, setIsListening] = useState(false);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);

  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  const showToast = (
    message: string,
    type: ToastState['type'] = 'info',
    onConfirm?: () => void,
    confirmLabel = 'Confirm'
  ) => {
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    setToast({ message, type, onConfirm, confirmLabel });

    if (type !== 'confirm') {
      toastTimerRef.current = setTimeout(() => {
        setToast(null);
      }, 3000);
    }
  };

  useEffect(() => {
    let storedId = localStorage.getItem('portfolio_chat_id');
    if (!storedId) {
      storedId = crypto.randomUUID();
      localStorage.setItem('portfolio_chat_id', storedId);
    }
    setChatId(storedId);

    return () => {
      if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    };
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

  useEffect(() => {
    return () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
    };
  }, [previewUrl]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFiles = e.target.files;
    if (selectedFiles && selectedFiles.length > 0) {
      if (selectedFiles[0].size > 2 * 1024 * 1024) {
        showToast('Please choose an image smaller than 2 MB.', 'error');
        e.target.value = '';
        return;
      }
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setFiles(selectedFiles);
      setPreviewUrl(URL.createObjectURL(selectedFiles[0]));
    }
  };

  const removeFile = () => {
    setFiles(undefined);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const toggleVoiceInput = () => {
    if (isListening) {
      recognitionRef.current?.stop();
      setIsListening(false);
      return;
    }

    const win = window as unknown as {
      SpeechRecognition?: SpeechRecognitionConstructor;
      webkitSpeechRecognition?: SpeechRecognitionConstructor;
    };
    const SpeechRecognitionAPI = win.SpeechRecognition || win.webkitSpeechRecognition;

    if (!SpeechRecognitionAPI) {
      showToast('Voice input is not supported in this browser. Try Chrome or Edge.', 'error');
      return;
    }

    const baseInput = input.trim();

    const recognition = new SpeechRecognitionAPI();
    recognition.lang = 'en-IN';
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      let liveTranscript = '';
      for (let i = 0; i < event.results.length; i++) {
        liveTranscript += event.results[i][0].transcript;
      }
      setInput(baseInput ? `${baseInput} ${liveTranscript}` : liveTranscript);
    };

    recognition.onerror = () => setIsListening(false);
    recognition.onend = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const toggleSpeak = (id: string, text: string) => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      showToast('Text-to-speech is not supported in this browser.', 'error');
      return;
    }

    if (speakingId === id) {
      window.speechSynthesis.cancel();
      setSpeakingId(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.onend = () => setSpeakingId(null);
    utterance.onerror = () => setSpeakingId(null);
    setSpeakingId(id);
    window.speechSynthesis.speak(utterance);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if ((!input.trim() && !files?.length) || isLoading || !chatId) return;

    const text = input.trim() || 'Describe this image.';
    const filesToSend = files;

    setInput('');
    removeFile();

    await sendMessage({ text, files: filesToSend }, { body: { chatId } });
  };

  const executeClearChat = async () => {
    if (!chatId) return;

    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setMessages([]);
    setToast(null);

    try {
      const res = await fetch(`/api/history?chatId=${chatId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Delete failed');
      showToast('Chat history cleared', 'success');
    } catch (error) {
      console.error('Failed to clear chat history from database:', error);
      showToast('Failed to clear chat history', 'error');
    }
  };

  const clearChat = () => {
    if (!chatId || messages.length === 0) return;
    showToast('Clear all chat history?', 'confirm', executeClearChat, 'Clear');
  };

  const executeDeleteMessage = async (messageId: string) => {
    if (!chatId) return;

    setMessages((prev) => prev.filter((m) => m.id !== messageId));
    setToast(null);

    try {
      const res = await fetch(
        `/api/history?chatId=${chatId}&messageId=${encodeURIComponent(messageId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('Delete failed');
      showToast('Message deleted', 'success');
    } catch (error) {
      console.error('Failed to delete message:', error);
      showToast('Failed to delete message', 'error');
    }
  };

  const deleteMessage = (messageId: string) => {
    if (!messageId) return;
    showToast('Delete this message?', 'confirm', () => executeDeleteMessage(messageId), 'Delete');
  };

  if (!chatId) return null;

  return (
    <div className="w-full max-w-3xl mx-auto p-3 sm:p-6 flex flex-col h-[100dvh] sm:h-[85vh] bg-black text-blue-50 font-sans sm:border border-blue-900 sm:shadow-[0_0_15px_#1e3a8a] sm:rounded-xl sm:mt-6 overflow-hidden">
      {/* Custom Toast Notification */}
      {toast && (
        <div
          className={`fixed top-3 left-3 right-3 sm:left-auto sm:top-5 sm:right-5 z-50 flex items-center justify-between sm:justify-start gap-3 px-4 py-3 rounded-xl border shadow-lg backdrop-blur-md text-sm transition-all ${
            toast.type === 'error'
              ? 'bg-red-950/90 border-red-500/60 text-red-200 shadow-[0_0_15px_rgba(239,68,68,0.3)]'
              : toast.type === 'success'
              ? 'bg-emerald-950/90 border-emerald-500/60 text-emerald-200 shadow-[0_0_15px_rgba(16,185,129,0.3)]'
              : 'bg-gray-950/95 border-blue-500/60 text-blue-100 shadow-[0_0_15px_rgba(59,130,246,0.4)]'
          }`}
        >
          <span>{toast.message}</span>

          {toast.type === 'confirm' && toast.onConfirm ? (
            <div className="flex items-center gap-2 ml-2 shrink-0">
              <button
                type="button"
                onClick={() => setToast(null)}
                className="px-2.5 py-1 text-xs rounded-lg bg-gray-800 text-gray-300 hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={toast.onConfirm}
                className="px-2.5 py-1 text-xs rounded-lg bg-red-600 text-white hover:bg-red-500 transition-colors font-medium"
              >
                {toast.confirmLabel || 'Confirm'}
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setToast(null)}
              className="opacity-70 hover:opacity-100 ml-1 shrink-0"
              title="Dismiss"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center gap-2 mb-3 sm:mb-6 border-b border-blue-900/50 pb-3 sm:pb-4">
        <h1 className="text-lg sm:text-2xl font-bold truncate text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-300 drop-shadow-[0_0_8px_rgba(59,130,246,0.8)]">
          Vishnu&apos;s AI Assistant
        </h1>
        <button
          onClick={clearChat}
          disabled={messages.length === 0 || isLoading || isFetchingHistory}
          className="shrink-0 text-xs sm:text-sm px-3 py-1.5 sm:px-4 sm:py-2 rounded-lg bg-red-950/40 text-red-400 border border-red-900/50 hover:bg-red-900/60 hover:text-red-300 transition-all disabled:opacity-30"
        >
          Clear Chat
        </button>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden space-y-4 mb-3 sm:mb-4 p-3 sm:p-4 rounded-lg bg-gray-950/50 border border-blue-900/50">
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
          <div className="text-center text-blue-500/50 mt-10 text-sm">
            Start a conversation, upload an image, or use the mic.
          </div>
        ) : (
          messages.map((m, i) => {
            const msgId = m.id || String(i);
            const messageText = m.parts
              ? m.parts
                  .filter((part) => part.type === 'text')
                  .map((part) => part.text)
                  .join('')
              : (m as { content?: string }).content || '';

            return (
              <div
                key={msgId}
                className={`p-3 sm:p-4 rounded-lg text-sm leading-relaxed break-words overflow-hidden ${
                  m.role === 'user'
                    ? 'bg-blue-950 border border-blue-500/50 shadow-[0_0_10px_rgba(59,130,246,0.2)] text-white ml-auto max-w-[90%] sm:max-w-[85%]'
                    : 'bg-gray-900 border border-gray-800 text-blue-100 max-w-[90%] sm:max-w-[85%]'
                }`}
              >
                <div className="flex items-center justify-between gap-2 mb-1">
                  <strong className={m.role === 'user' ? 'text-blue-300' : 'text-cyan-400'}>
                    {m.role === 'user' ? 'You' : 'AI'}
                  </strong>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {m.role === 'assistant' && messageText && (
                      <button
                        type="button"
                        onClick={() => toggleSpeak(msgId, messageText)}
                        title={speakingId === msgId ? 'Stop speaking' : 'Listen'}
                        className="p-1.5 rounded bg-blue-950/60 text-cyan-300 border border-blue-800/60 hover:bg-blue-900/60 transition-all"
                      >
                        {speakingId === msgId ? (
                          <Square className="w-3.5 h-3.5" />
                        ) : (
                          <Volume2 className="w-3.5 h-3.5" />
                        )}
                      </button>
                    )}

                    {m.id && (
                      <button
                        type="button"
                        onClick={() => deleteMessage(m.id)}
                        disabled={isLoading}
                        title="Delete message"
                        className="p-1.5 rounded text-red-400/70 hover:text-red-300 hover:bg-red-950/60 transition-all disabled:opacity-30"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Render uploaded images if present */}
                {m.parts
                  ?.filter(
                    (part) =>
                      part.type === 'file' &&
                      'mediaType' in part &&
                      typeof part.mediaType === 'string' &&
                      part.mediaType.startsWith('image/')
                  )
                  .map((part, idx) => (
                    <img
                      key={idx}
                      src={'url' in part ? String(part.url) : ''}
                      alt="Uploaded attachment"
                      className="max-h-60 max-w-full rounded-lg border border-blue-800/60 mb-2 object-contain"
                    />
                  ))}

                <span className="whitespace-pre-wrap break-words">{messageText}</span>
              </div>
            );
          })
        )}

        {isLoading && !isFetchingHistory && (
          <div className="text-blue-500 text-sm animate-pulse">Processing...</div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Image Preview Bar */}
      {previewUrl && (
        <div className="mb-2 sm:mb-3 flex items-center gap-3 p-2 bg-gray-900 border border-blue-800/70 rounded-lg max-w-full w-fit">
          <img
            src={previewUrl}
            alt="Preview"
            className="h-12 w-12 shrink-0 object-cover rounded border border-blue-700"
          />
          <span className="text-xs text-blue-300 max-w-[160px] truncate">
            {files?.[0]?.name}
          </span>
          <button
            type="button"
            onClick={removeFile}
            title="Remove image"
            className="shrink-0 text-red-400 hover:text-red-300 p-1"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Input Form */}
      <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2 w-full">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
        />

        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={isLoading || isFetchingHistory}
          title="Upload Image"
          className="shrink-0 p-2.5 sm:p-3 bg-gray-900 border border-blue-800 rounded-lg text-blue-400 hover:border-blue-400 hover:text-blue-300 disabled:opacity-50 transition-all"
        >
          <ImagePlus className="w-5 h-5" />
        </button>

        <button
          type="button"
          onClick={toggleVoiceInput}
          disabled={isLoading || isFetchingHistory}
          title={isListening ? 'Stop Listening' : 'Voice Input'}
          className={`shrink-0 p-2.5 sm:p-3 border rounded-lg transition-all disabled:opacity-50 ${
            isListening
              ? 'bg-red-950 border-red-500 text-red-400 shadow-[0_0_12px_rgba(239,68,68,0.6)] animate-pulse'
              : 'bg-gray-900 border-blue-800 text-blue-400 hover:border-blue-400 hover:text-blue-300'
          }`}
        >
          <Mic className="w-5 h-5" />
        </button>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={isListening ? 'Listening...' : 'Ask me anything...'}
          className="flex-1 min-w-0 p-2.5 sm:p-3 text-sm sm:text-base bg-gray-900 border border-blue-800 rounded-lg focus:outline-none focus:border-blue-400 focus:shadow-[0_0_10px_rgba(59,130,246,0.5)] transition-all text-white placeholder-blue-700"
          disabled={isLoading || isFetchingHistory}
        />

        <button
          type="submit"
          disabled={isLoading || isFetchingHistory || (!input.trim() && !files?.length)}
          className="shrink-0 bg-blue-600 text-white px-3.5 sm:px-4 py-2.5 sm:py-3 rounded-lg hover:bg-blue-500 hover:shadow-[0_0_15px_rgba(59,130,246,0.6)] disabled:opacity-50 transition-all flex items-center justify-center"
          title="Send message"
        >
          <Send className="w-5 h-5" />
        </button>
      </form>
    </div>
  );
}