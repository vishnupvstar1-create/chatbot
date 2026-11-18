import { streamText, convertToModelMessages } from 'ai';
import { createGroq } from '@ai-sdk/groq';
import clientPromise from '@/lib/mongodb';

const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });

export async function POST(req: Request) {
  try {
    const { messages, chatId } = await req.json();
    const client = await clientPromise;
    const db = client.db('chatbot');

    const latestMessage = messages[messages.length - 1];
    await db.collection('chats').updateOne(
      { chatId },
      { $push: { messages: latestMessage } },
      { upsert: true }
    );

    const result = streamText({
      model: groq('openai/gpt-oss-120b'),
      system: "You are a helpful AI assistant on Vishnu's developer portfolio. Keep answers brief and professional.",
      messages: await convertToModelMessages(messages),
      onError({ error }) {
        console.error('Groq Stream Error:', error);
      },
      async onFinish({ text }) {
        await db.collection('chats').updateOne(
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