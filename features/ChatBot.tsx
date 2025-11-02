
import React, { useState, useRef, useEffect } from 'react';
import type { Chat } from '@google/genai';
import { GeminiService } from '../services/geminiService';
import type { ChatMessage } from '../types';
import FeatureLayout from './common/FeatureLayout';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { SendIcon } from '../components/Icons';
import Spinner from '../components/Spinner';

const ChatBot: React.FC = () => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setChat(GeminiService.createChat());
    }, []);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !chat || isLoading) return;

        const userMessage: ChatMessage = { role: 'user', parts: [{ text: input }] };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const result = await chat.sendMessageStream({ message: input });
            let text = '';
            setMessages(prev => [...prev, { role: 'model', parts: [{ text: '' }] }]);

            for await (const chunk of result) {
                text += chunk.text;
                setMessages(prev => {
                    const newMessages = [...prev];
                    newMessages[newMessages.length - 1].parts[0].text = text;
                    return newMessages;
                });
            }
        } catch (error) {
            console.error(error);
            const errorMessage: ChatMessage = { role: 'model', parts: [{ text: 'Sorry, something went wrong. Please try again.' }] };
            setMessages(prev => [...prev, errorMessage]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Chat Bot" description="Engage in a conversation with Gemini. It remembers your chat history.">
            <div className="flex flex-col h-full max-w-4xl mx-auto">
                <div className="flex-grow overflow-y-auto pr-4 space-y-6">
                    {messages.map((msg, index) => (
                        <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`p-4 rounded-xl max-w-lg ${msg.role === 'user' ? 'bg-blue-600 text-white' : 'bg-slate-700 text-slate-200'}`}>
                                <MarkdownRenderer content={msg.parts[0].text} />
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="flex justify-start">
                             <div className="p-4 rounded-xl bg-slate-700">
                                <Spinner text="Gemini is typing..."/>
                             </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>
                <div className="mt-6 flex items-center space-x-2">
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder="Type your message..."
                        rows={1}
                        className="flex-grow p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                    />
                    <button
                        onClick={handleSend}
                        disabled={isLoading || !input.trim()}
                        className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white p-3 rounded-full transition-colors"
                    >
                        <SendIcon />
                    </button>
                </div>
            </div>
        </FeatureLayout>
    );
};

export default ChatBot;
