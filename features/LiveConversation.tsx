import React, { useState, useEffect, useRef, useCallback } from 'react';
// FIX: import from @google/genai instead of @google/ai/generativelanguage
import { LiveServerMessage, LiveSession, FunctionDeclaration, Type, FunctionCall } from '@google/genai';
import { GeminiService } from '../services/geminiService';
import FeatureLayout from './common/FeatureLayout';
import { decode, decodeAudioData, createPcmBlob, fileToBase64, formatBytes, base64ToBlob, readFileContent } from '../utils/helpers';
import { MicIcon, GlobeIcon } from '../components/Icons';
import useGeolocation from '../hooks/useGeolocation';
import type { GroundingSource } from '../types';
import MarkdownRenderer from '../components/MarkdownRenderer';

type ConnectionState = 'idle' | 'connecting' | 'connected' | 'error' | 'closed';

interface SessionData {
    transcripts: { user: string, model: string }[];
    analysisResult: string | null;
    sources: GroundingSource[];
    fileInfo?: {
        name: string;
        type: string;
        data: string; // base64
    };
}

interface LiveConversationProps {
    documents: File[];
}

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
        name: 'listDocuments',
        parameters: {
            type: Type.OBJECT,
            description: 'List the documents available in the document library.',
            properties: {},
        },
    },
    {
        name: 'analyzeFile',
        parameters: {
            type: Type.OBJECT,
            description: 'Analyze the content of a file. Use fileName for documents in the library, or analyze the file uploaded in this chat.',
            properties: {
                prompt: { type: Type.STRING, description: 'A detailed question or instruction for the analysis.' },
                fileName: { type: Type.STRING, description: 'The name of the file from the document library to analyze.' },
            },
            required: ['prompt'],
        },
    },
    {
        name: 'controlMediaPlayer',
        parameters: {
            type: Type.OBJECT,
            description: 'Controls the audio or video player. Can play, pause, stop, seek to a timestamp, or set volume.',
            properties: {
                action: {
                    type: Type.STRING,
                    description: 'The action to perform: "play", "pause", "stop", "seek", "setVolume".',
                    enum: ['play', 'pause', 'stop', 'seek', 'setVolume'],
                },
                timestamp: {
                    type: Type.NUMBER,
                    description: 'The time in seconds to seek to. Required only for the "seek" action.',
                },
                volume: {
                    type: Type.NUMBER,
                    description: 'The volume level from 0.0 to 1.0. Required only for the "setVolume" action.',
                }
            },
            required: ['action'],
        },
    },
    {
        name: 'readWebsiteContent',
        parameters: {
            type: Type.OBJECT,
            description: 'Reads the content of a website from the search results and provides a summary. Use a topic from the search result titles as the parameter.',
            properties: {
                topic: { type: Type.STRING, description: 'A keyword or topic from the title of the search result to read.' },
            },
            required: ['topic'],
        },
    },
];

const LiveConversation: React.FC<LiveConversationProps> = ({ documents }) => {
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
    
    const handleSaveSession = async () => {
        if (transcripts.length === 0 && !analysisResult && !file) {
            alert("Nothing to save.");
            return;
        }

        const sessionData: SessionData = {
            transcripts,
            analysisResult,
            sources,
        };

        if (file) {
            const fileData = await fileToBase64(file);
            sessionData.fileInfo = {
                name: file.name,
                type: file.type,
                data: fileData,
            };
        }

        const blob = new window.Blob([JSON.stringify(sessionData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-live-session-${new Date().toISOString()}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const handleLoadSession = (e: React.ChangeEvent<HTMLInputElement>) => {
        const sessionFile = e.target.files?.[0];
        if (!sessionFile) return;

        handleStopConversation();
        setFile(null);
        setFileUrl(null);

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const sessionData: SessionData = JSON.parse(event.target?.result as string);
                setTranscripts(sessionData.transcripts || []);
                setAnalysisResult(sessionData.analysisResult || null);
                setSources(sessionData.sources || []);

                if (sessionData.fileInfo) {
                    const { data, type, name } = sessionData.fileInfo;
                    const blob = base64ToBlob(data, type);
                    const restoredFile = new File([blob], name, { type });
                    setFile(restoredFile);
                    setFileUrl(URL.createObjectURL(restoredFile));
                }
            } catch (error) {
                console.error("Failed to load session:", error);
                alert("Invalid session file.");
            }
        };
        reader.readAsText(sessionFile);
        // Reset file input to allow loading the same file again
        e.target.value = '';
    };

    const handleToolCall = async (functionCalls: FunctionCall[]) => {
        setIsProcessingTool(true);
        setAnalysisResult('');
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
                        setSources([]); // Clear previous sources
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
                    
                    case 'listDocuments':
                        if (documents.length === 0) {
                            result = { status: 'success', message: "The document library is currently empty." };
                        } else {
                            result = { status: 'success', files: documents.map(f => f.name) };
                        }
                        break;

                    case 'analyzeFile':
                        let fileToAnalyze: File | undefined = undefined;

                        if (args.fileName) {
                            fileToAnalyze = documents.find(doc => doc.name === args.fileName);
                            if (!fileToAnalyze) {
                                result = { status: 'error', message: `Document "${args.fileName}" not found in the library.` };
                                break;
                            }
                        } else if (file) {
                            fileToAnalyze = file;
                        }

                        if (!fileToAnalyze) {
                           result = { status: 'error', message: 'No file specified or uploaded. Please ask the user to upload a file or specify one from the library.' };
                        } else {
                            let analysisText = '';
                            if (fileToAnalyze.type.startsWith('image/')) {
                                const base64 = await fileToBase64(fileToAnalyze);
                                analysisText = (await GeminiService.analyzeImage(args.prompt, base64, fileToAnalyze.type)).text;
                            } else if (fileToAnalyze.type.startsWith('video/')) {
                                const base64 = await fileToBase64(fileToAnalyze);
                                analysisText = (await GeminiService.analyzeVideo(args.prompt, base64, fileToAnalyze.type)).text;
                            } else if (fileToAnalyze.type.startsWith('audio/')) {
                                const base64 = await fileToBase64(fileToAnalyze);
                                analysisText = (await GeminiService.transcribeAudio(base64, fileToAnalyze.type)).text;
                            } else if (fileToAnalyze.type === 'application/pdf' || fileToAnalyze.type.startsWith('text/')) {
                                 const textContent = await readFileContent(fileToAnalyze);
                                 analysisText = (await GeminiService.analyzeDocument(textContent, args.prompt)).text;
                            } else {
                                analysisText = `Unsupported file type for analysis: ${fileToAnalyze.type}.`;
                            }
                            setAnalysisResult(analysisText);
                            result = { status: 'success', summary: analysisText };
                        }
                        break;
                    
                    case 'controlMediaPlayer':
                        if (mediaRef.current) {
                            switch(args.action) {
                                case 'play': mediaRef.current.play(); break;
                                case 'pause': mediaRef.current.pause(); break;
                                case 'stop':
                                    mediaRef.current.pause();
                                    mediaRef.current.currentTime = 0;
                                    break;
                                case 'seek':
                                    if (typeof args.timestamp === 'number') {
                                        mediaRef.current.currentTime = args.timestamp;
                                    }
                                    break;
                                case 'setVolume':
                                     if (typeof args.volume === 'number' && args.volume >= 0 && args.volume <= 1) {
                                        mediaRef.current.volume = args.volume;
                                    }
                                    break;
                            }
                            result = { status: 'success', action: args.action };
                        } else {
                            result = { status: 'error', message: 'No media is loaded.' };
                        }
                        break;

                    case 'readWebsiteContent':
                        if (sources.length === 0) {
                            result = { status: 'error', message: 'No websites have been searched yet. Please perform a web search first.' };
                            break;
                        }
                        const topic = (args.topic || '').toLowerCase();
                        const targetSource = sources.find(s => s.title.toLowerCase().includes(topic));

                        if (!targetSource) {
                            result = { status: 'error', message: `Could not find a search result related to "${args.topic}". Please be more specific or try another topic from the search results.` };
                            break;
                        }
                        
                        try {
                            const response = await fetch(targetSource.uri);
                            if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
                            
                            const html = await response.text();
                            const textContent = html.replace(/<style[^>]*>.*<\/style>/gs, '')
                                                    .replace(/<script[^>]*>.*<\/script>/gs, '')
                                                    .replace(/<[^>]+>/g, ' ')
                                                    .replace(/\s+/g, ' ').trim();

                            if (textContent.length < 50) {
                                 result = { status: 'error', message: 'Could not extract enough readable text from the website.' };
                                 break;
                            }

                            const summaryResponse = await GeminiService.analyzeDocument(textContent.substring(0, 30000), 'Please summarize the following website content concisely.');
                            const summary = summaryResponse.text;
                            setAnalysisResult(summary);
                            result = { status: 'success', summary: summary };

                        } catch (e) {
                             const errorMessage = 'I was unable to access that website due to web security restrictions (CORS). I cannot read the content from every page.';
                             setAnalysisResult(errorMessage);
                             result = { status: 'error', message: errorMessage };
                        }
                        break;
                }
            } catch (e: any) {
                console.error(`Error executing tool ${name}:`, e);
                result = { status: 'error', message: e.message };
                setAnalysisResult(`Error: ${e.message}`);
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
        if (!file || !fileUrl) return <p className="text-slate-500 text-center">Upload a file for temporary analysis.</p>;
        if (file.type.startsWith("image/")) return <img src={fileUrl} alt={file.name} className="max-h-full max-w-full object-contain rounded-lg" />;
        if (file.type.startsWith("video/")) return <video ref={mediaRef} src={fileUrl} controls className="w-full rounded-lg" />;
        if (file.type.startsWith("audio/")) return <audio ref={mediaRef} src={fileUrl} controls className="w-full" />;
        return <div className="text-center text-slate-300"> <p className="font-bold">{file.name}</p> <p className="text-sm">{formatBytes(file.size)}</p> d></div>;
    };

    return (
        <FeatureLayout title="Live Conversation" description="Speak with a multimodal Gemini assistant. Ask it to search, analyze files, and more.">
            <div className="grid md:grid-cols-2 gap-6 h-full overflow-hidden">
                <div className="flex flex-col space-y-4 overflow-hidden">
                    <div className="flex-shrink-0 flex items-center justify-center flex-wrap gap-2">
                         {connectionState !== 'connected' ? (
                            <button onClick={handleStartConversation} disabled={connectionState === 'connecting'} className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 transition-colors disabled:bg-slate-600">
                                <MicIcon />
                                <span>{connectionState === 'connecting' ? 'Connecting...' : 'Start Conversation'}</span>
                            </button>
                        ) : (
                            <button onClick={handleStopConversation} className="bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg flex items-center space-x-2 transition-colors">
                                <MicIcon />
                                <span>Stop Conversation</span>
                            </button>
                        )}
                         <input type="file" id="file-upload" className="hidden" onChange={handleFileChange} />
                         <label htmlFor="file-upload" className="bg-slate-700 hover:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg cursor-pointer transition-colors text-center">
                             {file ? "Change File" : "Upload File"}
                         </label>
                         <button onClick={handleSaveSession} className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg transition-colors">Save Session</button>
                         <input type="file" id="load-session" className="hidden" accept=".json" onChange={handleLoadSession} />
                         <label htmlFor="load-session" className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-lg cursor-pointer transition-colors text-center">Load Session</label>
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