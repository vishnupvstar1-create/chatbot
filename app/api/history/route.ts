import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

interface ChatMessage {
  id?: string;
  role: string;
  parts?: unknown[];
  content?: string;
}

interface ChatDocument {
  chatId: string;
  messages: ChatMessage[];
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const chat = await client
      .db('chatbot')
      .collection<ChatDocument>('chats')
      .findOne({ chatId });

    return NextResponse.json({ messages: chat?.messages || [] });
  } catch (error) {
    console.error('MongoDB GET Error:', error);
    return NextResponse.json({ error: 'Database connection failed' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    const messageId = searchParams.get('messageId');

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }

    const client = await clientPromise;
    const chatsCollection = client.db('chatbot').collection<ChatDocument>('chats');

    // If messageId is provided, remove only that message
    if (messageId) {
      await chatsCollection.updateOne(
        { chatId },
        { $pull: { messages: { id: messageId } } }
      );
      return NextResponse.json({ success: true, deletedMessageId: messageId });
    }

    // Otherwise, clear the entire chat session
    await chatsCollection.deleteOne({ chatId });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('MongoDB DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete' }, { status: 500 });
  }
}