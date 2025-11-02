import React, { useState, useEffect, useRef, useCallback } from 'react';
import { LiveServerMessage, LiveSession, FunctionDeclaration, Type, FunctionCall } from '@google/genai';
import { GeminiService } from '../services/geminiService';
import FeatureLayout from './common/FeatureLayout';
import { decode, decodeAudioData, createPcmBlob, fileToBase64, formatBytes } from '../utils/helpers';
import { MicIcon, GlobeIcon } from '../components/Icons';
import useGeolocation from '../hooks/useGeolocation';
import type { GroundingSource } from '../types';
import MarkdownRenderer from '../components/MarkdownRenderer';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

const functionDeclarations: FunctionDeclaration[] = [
    {
        name: 'searchWeb',
        parameters: {
            type: Type.OBJECT,
            description: 'Search Google for recent and relevant information.',
            properties: {
                query: { type: Type.STRING, description: 'The search query.' },
                useMaps: { type: Type.BOOLEAN, description: 'Set to true to also search Google Maps. Requires user location.' }
            },
            required: ['query'],
        },
    },
    {
        name: 'analyzeFile',
        parameters: {
            type: Type.OBJECT,
            description: 'Analyze the content of the file the user has uploaded. Use this for images, videos, audio, and documents.',
            properties: {
                prompt: { type: Type.STRING, description: 'A detailed question or instruction for the analysis.' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'controlMediaPlayer',
        parameters: {
            type: Type.OBJECT,
            description: 'Controls the audio or video player for the uploaded file.',
            properties: {
                action: {
                    type: Type.STRING,
                    description: 'The action to perform: "play", "pause", or "stop".',
                    enum: ['play', 'pause', 'stop'],
                },
            },
            required: ['action'],
        },
    },
];

const LiveConversation: React.FC = () => {
    const [connectionState, setConnectionState] = useState<ConnectionState>('idle');
    const [transcripts, setTranscripts] = useState<{ user: string, model: string }[]>([]);
    const [currentInterim, setCurrentInterim] = useState<{ user: string, model: string }>({ user: '', model: '' });
    const [file, setFile] = useState<File | null>(null);
    const [fileUrl, setFileUrl] = useState<string | null>(null);
    const [analysisResult, setAnalysisResult] = useState<string | null>(null);
    const [sources, setSources] = useState<GroundingSource[]>([]);
    const [isProcessingTool, setIsProcessingTool] = useState(false);

    const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
    const audioContextRef = useRef<AudioContext | null>(null);
    const outputAudioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement | null>(null);
    const location = useGeolocation();

    const nextStartTimeRef = useRef(0);
    const sourcesRef = useRef(new Set<AudioBufferSourceNode>());

    const handleStopConversation = useCallback(() => {
        sessionPromiseRef.current?.then(session => session.close());
        sessionPromiseRef.current = null;
        
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;
        
        scriptProcessorRef.current?.disconnect();
        scriptProcessorRef.current = null;
        
        audioContextRef.current?.close();
        audioContextRef.current = null;
        
        outputAudioContextRef.current?.close();
        outputAudioContextRef.current = null;
        
        sourcesRef.current.forEach(source => source.stop());
        sourcesRef.current.clear();
        
        setConnectionState('idle');
        setFile(null);
        setFileUrl(null);
        setAnalysisResult(null);
        setSources([]);
    }, []);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setAnalysisResult(null);
            setSources([]);
            if (fileUrl) {
                URL.revokeObjectURL(fileUrl);
            }
            setFileUrl(URL.createObjectURL(selectedFile));
        }
    };

    const handleToolCall = async (functionCalls: FunctionCall[]) => {
        setIsProcessingTool(true);
        const session = await sessionPromiseRef.current;
        if (!session) return;

        for (const fc of functionCalls) {
            const { name, args } = fc;
            let result: any = { status: 'error', message: 'Unknown function' };

            try {
                switch (name) {
                    case 'searchWeb':
                        const geo = (location.latitude && location.longitude) ? { latitude: location.latitude, longitude: location.longitude } : undefined;
                        const searchResponse = await GeminiService.groundedSearch(args.query, args.useMaps, geo);
                        const searchResultText = searchResponse.text;
                        const groundingChunks = searchResponse.candidates?.[0]?.groundingMetadata?.groundingChunks;
                        if (groundingChunks) {
                            const newSources: GroundingSource[] = groundingChunks.map((chunk: any) => ({
                                uri: chunk.web?.uri || chunk.maps?.uri || '#',
                                title: chunk.web?.title || chunk.maps?.title || 'Unknown Source',
                                type: chunk.web ? 'web' : 'maps'
                            })).filter((s: GroundingSource) => s.uri !== '#');
                            setSources(newSources);
                        }
                        setAnalysisResult(searchResultText);
                        result = { status: 'success', summary: searchResultText };
                        break;

                    case 'analyzeFile':
                        if (!file) {
                           result = { status: 'error', message: 'No file uploaded. Please ask the user to upload a file first.' };
                        } else {
                            let analysisText = '';
                            if (file.type.startsWith('image/')) {
                                const base64 = await fileToBase64(file);
                                analysisText = (await GeminiService.analyzeImage(args.prompt, base64, file.type)).text;
                            } else if (file.type.startsWith('video/')) {
                                const base64 = await fileToBase64(file);
                                analysisText = (await GeminiService.analyzeVideo(args.prompt, base64, file.type)).text;
                            } else if (file.type.startsWith('audio/')) {
                                const base64 = await fileToBase64(file);
                                analysisText = (await GeminiService.transcribeAudio(base64, file.type)).text;
                            } else if (file.type === 'application/pdf' || file.type.startsWith('text/')) {
                                 const textContent = await file.text(); // simplified for brevity; pdf requires more work.
                                 analysisText = (await GeminiService.analyzeDocument(textContent, args.prompt)).text;
                            } else {
                                analysisText = "Unsupported file type.";
                            }
                            setAnalysisResult(analysisText);
                            result = { status: 'success', summary: analysisText };
                        }
                        break;
                    
                    case 'controlMediaPlayer':
                        if (mediaRef.current) {
                            if (args.action === 'play') mediaRef.current.play();
                            else if (args.action === 'pause') mediaRef.current.pause();
                            else if (args.action === 'stop') {
                                mediaRef.current.pause();
                                mediaRef.current.currentTime = 0;
                            }
                            result = { status: 'success', action: args.action };
                        } else {
                            result = { status: 'error', message: 'No media is loaded.' };
                        }
                        break;
                }
            } catch (e: any) {
                console.error(`Error executing tool ${name}:`, e);
                result = { status: 'error', message: e.message };
            }
            
            session.sendToolResponse({
                functionResponses: { id: fc.id, name: fc.name, response: { result } }
            });
        }
        setIsProcessingTool(false);
    };

    const handleStartConversation = async () => {
        setConnectionState('connecting');
        setTranscripts([]);
        setCurrentInterim({ user: '', model: '' });
        setAnalysisResult(null);
        setSources([]);

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
                    if (message.toolCall) {
                        handleToolCall(message.toolCall.functionCalls);
                    }
                    if (message.serverContent?.inputTranscription) {
                        setCurrentInterim(prev => ({ ...prev, user: prev.user + message.serverContent.inputTranscription.text }));
                    }
                    if (message.serverContent?.outputTranscription) {
                        setCurrentInterim(prev => ({ ...prev, model: prev.model + message.serverContent.outputTranscription.text }));
                    }
                    if (message.serverContent?.turnComplete) {
                        setCurrentInterim(current => {
                            if (current.user || current.model) {
                                setTranscripts(prev => [...prev, current]);
                            }
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
                onerror: (e: ErrorEvent) => { console.error('Live session error:', e); setConnectionState('error'); },
                onclose: () => { setConnectionState('closed'); },
            }, [{ functionDeclarations }]);

            sessionPromiseRef.current = sessionPromise;

        } catch (error) {
            console.error("Failed to start conversation:", error);
            setConnectionState('error');
        }
    };
    
    useEffect(() => {
        return () => { handleStopConversation(); };
    }, [handleStopConversation]);

    const renderMedia = () => {
        if (!file || !fileUrl) return <p className="text-slate-500 text-center">Upload a file to analyze.</p>;
        if (file.type.startsWith("image/")) return <img src={fileUrl} alt={file.name} className="max-h-full max-w-full object-contain rounded-lg" />;
        if (file.type.startsWith("video/")) return <video ref={mediaRef} src={fileUrl} controls className="w-full rounded-lg" />;
        if (file.type.startsWith("audio/")) return <audio ref={mediaRef} src={fileUrl} controls className="w-full" />;
        return <div className="text-center text-slate-300"> <p className="font-bold">{file.name}</p> <p className="text-sm">{formatBytes(file.size)}</p> </div>;
    };

    return (
        <FeatureLayout title="Live Conversation" description="Speak with a multimodal Gemini assistant. Ask it to search, analyze files, and more.">
            <div className="grid md:grid-cols-2 gap-6 h-full overflow-hidden">
                <div className="flex flex-col space-y-4 overflow-hidden">
                    <div className="flex-shrink-0 flex items-center justify-center space-x-4">
                         {connectionState !== 'connected' ? (
                            <button onClick={handleStartConversation} disabled={connectionState === 'connecting'} className="bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-colors disabled:bg-slate-600">
                                <MicIcon />
                                <span>{connectionState === 'connecting' ? 'Connecting...' : 'Start Conversation'}</span>
                            </button>
                        ) : (
                            <button onClick={handleStopConversation} className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-6 rounded-full flex items-center space-x-2 transition-colors">
                                <MicIcon />
                                <span>Stop Conversation</span>
                            </button>
                        )}
                         <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
                         <label htmlFor="file-upload" className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-3 px-6 rounded-full cursor-pointer transition-colors">
                             {file ? "Change File" : "Upload File"}
                         </label>
                    </div>
                    <div className="flex-grow bg-slate-800/50 rounded-lg p-4 flex items-center justify-center min-h-0">{renderMedia()}</div>
                </div>
                <div className="flex flex-col space-y-4 h-full overflow-hidden">
                    <div className="flex-grow bg-slate-800/50 rounded-lg p-4 overflow-y-auto min-h-0">
                        <h3 className="text-lg font-semibold mb-2 text-slate-300 border-b border-slate-700 pb-2">Analysis & Search Results</h3>
                        {isProcessingTool && <p className="text-slate-400">Processing request...</p>}
                        {analysisResult && <MarkdownRenderer content={analysisResult} />}
                        {sources.length > 0 && (
                            <div className="mt-4">
                                <h4 className="font-semibold text-slate-400">Sources:</h4>
                                <ul className="space-y-1 mt-1">{sources.map((s, i) => <li key={i} className="flex items-start space-x-2"><GlobeIcon /><a href={s.uri} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline text-sm truncate">{s.title}</a></li>)}</ul>
                            </div>
                        )}
                        {!analysisResult && !isProcessingTool && <p className="text-slate-500">Results from tools will appear here.</p>}
                    </div>
                    <div className="flex-grow bg-slate-800/50 rounded-lg p-4 overflow-y-auto min-h-0">
                         <h3 className="text-lg font-semibold mb-2 text-slate-300 border-b border-slate-700 pb-2">Conversation Transcript</h3>
                        {transcripts.map((t, i) => (
                            <div key={i} className="mb-3">
                                <p className="text-blue-300 font-semibold">You:</p><p className="text-slate-300 ml-2">{t.user}</p>
                                <p className="text-green-300 font-semibold mt-1">Gemini:</p><p className="text-slate-300 ml-2">{t.model}</p>
                            </div>
                        ))}
                        {(currentInterim.user || currentInterim.model) && (
                            <div>
                               {currentInterim.user && <p className="text-blue-300/70">You: <span className="text-slate-400 font-normal">{currentInterim.user}</span></p>}
                               {currentInterim.model && <p className="text-green-300/70 mt-1">Gemini: <span className="text-slate-400 font-normal">{currentInterim.model}</span></p>}
                            </div>
                        )}
                        {connectionState === 'idle' && !transcripts.length && <div className="text-slate-500">Press "Start Conversation" to begin.</div>}
                    </div>
                </div>
            </div>
             <div className="h-8 text-center mt-2">
                {connectionState === 'error' && <p className="text-red-400">An error occurred. Please try again.</p>}
                {connectionState === 'closed' && <p className="text-yellow-400">Connection closed.</p>}
            </div>
        </FeatureLayout>
    );
};

export default LiveConversation;