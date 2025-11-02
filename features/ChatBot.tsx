import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { Chat } from '@google/genai';
import { GeminiService } from '../services/geminiService';
import type { ChatMessage } from '../types';
import FeatureLayout from './common/FeatureLayout';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { SendIcon, TrashIcon } from '../components/Icons';
import Spinner from '../components/Spinner';
import Tooltip from '../components/Tooltip';
import { dbService } from '../services/dbService';

const HISTORY_SUMMARY_THRESHOLD = 10; // Summarize after 10 messages (5 user/model pairs)
const MESSAGES_TO_KEEP_AFTER_SUMMARY = 4; // Keep the last 4 messages (2 pairs)

const ChatBot: React.FC = () => {
    const [chat, setChat] = useState<Chat | null>(null);
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const initializeChat = async () => {
            try {
                const history = await dbService.getChatHistory();
                setMessages(history);
                const chatInstance = GeminiService.createChatWithHistory(
                    history.map(m => ({ role: m.role, parts: m.parts }))
                );
                setChat(chatInstance);
            } catch (error) {
                console.error("Failed to load chat history:", error);
                setChat(GeminiService.createChat());
            }
        };
        initializeChat();
    }, []);
    
    useEffect(() => {
        // Persist messages to IndexedDB whenever they change, if there are any.
        if (messages.length > 0) {
            dbService.saveChatHistory(messages).catch(error => {
                console.error("Failed to save chat history:", error);
            });
        }
    }, [messages]);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    };

    useEffect(scrollToBottom, [messages]);

    const handleSend = async () => {
        if (!input.trim() || !chat || isLoading || isSummarizing) return;

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
             setMessages(prev => {
                const newMessages = [...prev];
                if (newMessages.length > 0 && newMessages[newMessages.length - 1].role === 'model' && newMessages[newMessages.length - 1].parts[0].text === '') {
                     newMessages[newMessages.length - 1].parts[0].text = 'Sorry, something went wrong. Please try again.';
                } else {
                    newMessages.push({ role: 'model', parts: [{ text: 'Sorry, something went wrong. Please try again.' }] });
                }
                return newMessages;
            });
        } finally {
            setIsLoading(false);
        }
    };

    const summarizeHistory = useCallback(async () => {
        if (!chat || messages.length < HISTORY_SUMMARY_THRESHOLD || isLoading) {
            return;
        }

        setIsSummarizing(true);
        try {
            const historyToSummarize = await chat.getHistory();
            if (historyToSummarize.length === 0) {
                setIsSummarizing(false);
                return;
            }
            
            const summary = await GeminiService.summarizeConversation(historyToSummarize);

            const recentMessages = messages.slice(messages.length - MESSAGES_TO_KEEP_AFTER_SUMMARY);

            const newChatHistory = [
                {
                    role: 'user' as const,
                    parts: [{ text: `Let's continue our conversation. Here is a summary of what we've discussed so far:\n\n${summary}` }]
                },
                {
                    role: 'model' as const,
                    parts: [{ text: "Thank you for the summary. I'm ready to continue." }]
                },
                ...recentMessages.map(m => ({
                    role: m.role,
                    parts: m.parts,
                })),
            ];

            const newChat = GeminiService.createChatWithHistory(newChatHistory);
            setChat(newChat);

            const summaryNotification: ChatMessage = {
                role: 'model',
                parts: [{ text: `_Conversation summarized to preserve context. Last ${MESSAGES_TO_KEEP_AFTER_SUMMARY / 2} turns kept._` }]
            };
            setMessages([summaryNotification, ...recentMessages]);
            
        } catch (error) {
            console.error("Failed to summarize conversation:", error);
            const errorNotification: ChatMessage = {
                role: 'model',
                parts: [{ text: `_Sorry, I failed to summarize our conversation. We can continue, but I might lose some context._` }]
            };
            setMessages(prev => [...prev, errorNotification]);
        } finally {
            setIsSummarizing(false);
        }
    }, [chat, messages, isLoading]);
    
    const handleClearHistory = async () => {
        if (window.confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) {
            try {
                await dbService.clearChatHistory();
                setMessages([]);
                setChat(GeminiService.createChat()); // Re-initialize chat session
            } catch (error) {
                console.error("Failed to clear chat history:", error);
                alert("Could not clear chat history. Please try again.");
            }
        }
    };

    useEffect(() => {
        if (messages.length >= HISTORY_SUMMARY_THRESHOLD && !isSummarizing && !isLoading) {
            summarizeHistory();
        }
    }, [messages, isSummarizing, isLoading, summarizeHistory]);


    return (
        <FeatureLayout title="Chat Bot" description="Engage in a conversation with Gemini. It remembers your chat history and summarizes long conversations to maintain context.">
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
                    <Tooltip text="Clear chat history. This cannot be undone.">
                        <button
                            onClick={handleClearHistory}
                            disabled={isLoading || isSummarizing || messages.length === 0}
                            className="bg-slate-700 hover:bg-red-600/50 disabled:bg-slate-800 disabled:text-slate-600 disabled:cursor-not-allowed text-slate-400 p-3 rounded-full transition-colors"
                            aria-label="Clear chat history"
                        >
                            <TrashIcon />
                        </button>
                    </Tooltip>
                    <textarea
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
                        placeholder={isSummarizing ? "Summarizing conversation, please wait..." : "Type your message..."}
                        rows={1}
                        className="flex-grow p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none resize-none"
                        disabled={isSummarizing}
                        aria-label="Chat input"
                    />
                    <Tooltip text="Send your message to the chatbot. You can also press Enter (without Shift) to send." position="top">
                        <button
                            onClick={handleSend}
                            disabled={isLoading || !input.trim() || isSummarizing}
                            className="bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white p-3 rounded-full transition-colors"
                            aria-label="Send message"
                        >
                            <SendIcon />
                        </button>
                    </Tooltip>
                </div>
            </div>
        </FeatureLayout>
    );
};

export default ChatBot;