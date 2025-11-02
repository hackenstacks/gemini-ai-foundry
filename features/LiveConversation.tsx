
import React, { useState, useEffect, useRef, useCallback } from 'react';
import type { LiveServerMessage, LiveSession } from '@google/genai';
import { GeminiService } from '../services/geminiService';
import FeatureLayout from './common/FeatureLayout';
import { decode, decodeAudioData, createPcmBlob } from '../utils/helpers';
import { MicIcon } from '../components/Icons';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

const LiveConversation: React.FC = () => {
    const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
    const [transcripts, setTranscripts] = useState<{ user: string, model: string }[]>([]);
    const [currentInterim, setCurrentInterim] = useState<{ user: string, model: string }>({ user: '', model: '' });

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);

    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const handleStartConversation = async () => {
        setConnectionState('connecting');
        setTranscripts([]);
        setCurrentInterim({ user: '', model: '' });
        
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const inputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 16000 });
            audioContextRef.current = inputAudioContext;
            
            const outputAudioContext = new (window.AudioContext || (window as any).webkitAudioContext)({ sampleRate: 24000 });
            outputAudioContextRef.current = outputAudioContext;
            
            const sessionPromise = GeminiService.connectLive({
                onopen: () => {
                    setConnectionState('connected');

                    // Stream audio from the microphone to the model.
                    const source = inputAudioContext.createMediaStreamSource(stream);
                    const scriptProcessor = inputAudioContext.createScriptProcessor(4096, 1, 1);
                    scriptProcessorRef.current = scriptProcessor;

                    scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromiseRef.current?.then((session) => {
                            session.sendRealtimeInput({ media: pcmBlob });
                        });
                    };
                    source.connect(scriptProcessor);
                    scriptProcessor.connect(inputAudioContext.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.serverContent?.inputTranscription) {
                        setCurrentInterim(prev => ({ ...prev, user: prev.user + message.serverContent.inputTranscription.text }));
                    }
                    if (message.serverContent?.outputTranscription) {
                        setCurrentInterim(prev => ({ ...prev, model: prev.model + message.serverContent.outputTranscription.text }));
                    }

                    if (message.serverContent?.turnComplete) {
                        setCurrentInterim(current => {
                            setTranscripts(prev => [...prev, current]);
                            return { user: '', model: '' };
                        });
                    }

                    const base64Audio = message.serverContent?.modelTurn?.parts[0]?.inlineData?.data;
                    if (base64Audio && outputAudioContextRef.current) {
                        const ctx = outputAudioContextRef.current;
                        nextStartTimeRef.current = Math.max(nextStartTimeRef.current, ctx.currentTime);
                        const audioBuffer = await decodeAudioData(decode(base64Audio), ctx, 24000, 1);
                        const source = ctx.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(ctx.destination);
                        source.addEventListener('ended', () => sourcesRef.current.delete(source));
                        source.start(nextStartTimeRef.current);
                        nextStartTimeRef.current += audioBuffer.duration;
                        sourcesRef.current.add(source);
                    }

                    if (message.serverContent?.interrupted) {
                        sourcesRef.current.forEach(source => source.stop());
                        sourcesRef.current.clear();
                        nextStartTimeRef.current = 0;
                    }
                },
                onerror: (e: ErrorEvent) => {
                    console.error('Live session error:', e);
                    setConnectionState('error');
                },
                onclose: (e: CloseEvent) => {
                    setConnectionState('closed');
                },
            });

            sessionPromiseRef.current = sessionPromise;

        } catch (error) {
            console.error("Failed to start conversation:", error);
            setConnectionState('error');
        }
    };

    const handleStopConversation = useCallback(() => {
        if (sessionPromiseRef.current) {
            sessionPromiseRef.current.then(session => session.close());
            sessionPromiseRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        if (scriptProcessorRef.current) {
            scriptProcessorRef.current.disconnect();
            scriptProcessorRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if(outputAudioContextRef.current) {
            outputAudioContextRef.current.close();
            outputAudioContextRef.current = null;
        }
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        setConnectionState('idle');
    }, []);

    useEffect(() => {
        return () => {
           handleStopConversation();
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return (
        <FeatureLayout title="Live Conversation" description="Speak with Gemini in real-time. Start the conversation and talk into your microphone.">
            <div className="flex flex-col items-center justify-center h-full space-y-8">
                <div className="w-full max-w-4xl h-96 bg-slate-800/50 rounded-lg p-4 overflow-y-auto flex flex-col space-y-4">
                    {transcripts.map((t, i) => (
                        <div key={i}>
                            <p className="text-blue-300 font-semibold">You:</p>
                            <p className="text-slate-300 ml-2">{t.user}</p>
                            <p className="text-green-300 font-semibold mt-2">Gemini:</p>
                            <p className="text-slate-300 ml-2">{t.model}</p>
                        </div>
                    ))}
                    {(currentInterim.user || currentInterim.model) && (
                        <div>
                           {currentInterim.user && <p className="text-blue-300/70 font-semibold">You: <span className="text-slate-400 font-normal">{currentInterim.user}</span></p>}
                           {currentInterim.model && <p className="text-green-300/70 font-semibold mt-2">Gemini: <span className="text-slate-400 font-normal">{currentInterim.model}</span></p>}
                        </div>
                    )}
                     {connectionState === 'idle' && !transcripts.length && (
                        <div className="flex-1 flex items-center justify-center text-slate-500">
                            Press "Start Conversation" to begin.
                        </div>
                    )}
                </div>

                <div className="flex items-center space-x-4">
                    {connectionState !== 'connected' ? (
                        <button 
                            onClick={handleStartConversation}
                            disabled={connectionState === 'connecting'}
                            className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-colors disabled:bg-slate-600"
                        >
                            <MicIcon />
                            <span>{connectionState === 'connecting' ? 'Connecting...' : 'Start Conversation'}</span>
                        </button>
                    ) : (
                        <button 
                            onClick={handleStopConversation}
                            className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-colors"
                        >
                            <MicIcon />
                            <span>Stop Conversation</span>
                        </button>
                    )}
                </div>
                <div className="h-8">
                    {connectionState === 'error' && <p className="text-red-400">An error occurred. Please try again.</p>}
                    {connectionState === 'closed' && <p className="text-yellow-400">Connection closed.</p>}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default LiveConversation;
