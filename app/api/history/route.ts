import { NextResponse } from 'next/server';
import clientPromise from '@/lib/mongodb';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const chatId = searchParams.get('chatId');
    
    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }
    
    const client = await clientPromise;
    const chat = await client.db('chatbot').collection('chats').findOne({ chatId });
    
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

    if (!chatId) {
      return NextResponse.json({ error: 'Chat ID is required' }, { status: 400 });
    }
    
    const client = await clientPromise;
    await client.db('chatbot').collection('chats').deleteOne({ chatId });
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('MongoDB DELETE Error:', error);
    return NextResponse.json({ error: 'Failed to delete chat' }, { status: 500 });
  }
}