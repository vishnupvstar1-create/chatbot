import { streamText, convertToModelMessages } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import clientPromise from '@/lib/mongodb';
import { PORTFOLIO_SYSTEM_PROMPT } from '@/lib/portfolioContext';

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

interface ChatDocument {
  chatId: string;
  messages: unknown[];
}

export async function POST(req: Request) {
  try {
    const { messages, chatId } = await req.json();
    const client = await clientPromise;
    const chatsCollection = client.db('chatbot').collection<ChatDocument>('chats');

    const latestMessage = messages[messages.length - 1];
    await chatsCollection.updateOne(
      { chatId },
      { $push: { messages: latestMessage } },
      { upsert: true }
    );

    const result = streamText({
      model: groq('qwen/qwen3.8-27b'),
      system: PORTFOLIO_SYSTEM_PROMPT,
      temperature: 0.4,
      messages: await convertToModelMessages(messages),
      onError({ error }) {
        console.error('Groq Stream Error:', error);
      },
      async onFinish({ text }) {
        await chatsCollection.updateOne(
          { chatId },
          {
            $push: {
              messages: {
                id: crypto.randomUUID(),
                role: 'assistant',
                parts: [{ type: 'text', text }],
              },
            },
          }
        );
      },
    });

    return result.toUIMessageStreamResponse({
      onError: (error) => {
        if (error instanceof Error) return error.message;
        return String(error);
      },
    });
  } catch (error) {
    console.error('Chat Route Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500 }
    );
  }
}