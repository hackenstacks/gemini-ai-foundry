// FIX: import from @google/genai instead of @google/ai/generativelanguage
import { GoogleGenAI, Type, Modality, Chat, GenerateContentResponse, GroundingChunk, LiveServerMessage, FunctionDeclaration, Content } from '@google/genai';

const getAi = (): GoogleGenAI => {
    if (!process.env.API_KEY) {
        console.error("API_KEY environment variable not set.");
        throw new Error("API key is missing.");
    }
    // Always create a new instance to avoid issues with stale API keys.
    return new GoogleGenAI({ apiKey: process.env.API_KEY });
};

type LiveCallbacks = {
    onopen?: () => void;
    onmessage?: (message: LiveServerMessage) => void;
    onerror?: (e: ErrorEvent) => void;
    onclose?: (e: CloseEvent) => void;
};

export const GeminiService = {
    createChat: (): Chat => {
        return getAi().chats.create({
            model: 'gemini-2.5-flash',
        });
    },

    createChatWithHistory: (history: Content[]): Chat => {
        return getAi().chats.create({
            model: 'gemini-2.5-flash',
            history: history,
        });
    },

    summarizeConversation: async (history: Content[]): Promise<string> => {
        const conversationText = history
            .map(c => `${c.role}: ${c.parts.map(p => ('text' in p) ? p.text : '').join('')}`)
            .join('\n\n');

        if (!conversationText.trim()) {
            return "No conversation to summarize.";
        }

        const prompt = `Summarize the following conversation concisely. Focus on key information, decisions, and any unresolved topics that might be important for the next part of the conversation. The summary should be from a neutral, third-person perspective.\n\n---\n\n${conversationText}`;
        
        const response = await getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        return response.text;
    },

    analyzeImage: async (prompt: string, imageBase64: string, mimeType: string): Promise<GenerateContentResponse> => {
        const imagePart = {
            inlineData: {
                data: imageBase64,
                mimeType,
            },
        };
        const textPart = { text: prompt };

        return getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [imagePart, textPart] },
        });
    },

    generateImage: async (prompt: string, aspectRatio: string): Promise<string[]> => {
        const response = await getAi().models.generateImages({
            model: 'imagen-4.0-generate-001',
            prompt,
            config: {
                numberOfImages: 1,
                outputMimeType: 'image/jpeg',
                aspectRatio: aspectRatio as "1:1" | "3:4" | "4:3" | "9:16" | "16:9",
            },
        });
        return response.generatedImages.map(img => img.image.imageBytes);
    },

    analyzeVideo: async (prompt: string, videoBase64: string, mimeType: string): Promise<GenerateContentResponse> => {
        const videoPart = {
            inlineData: {
                data: videoBase64,
                mimeType,
            },
        };
        const textPart = { text: prompt };

        return getAi().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: { parts: [videoPart, textPart] },
        });
    },

    transcribeAudio: async (audioBase64: string, mimeType: string): Promise<GenerateContentResponse> => {
        const audioPart = {
            inlineData: {
                data: audioBase64,
                mimeType,
            },
        };
        const textPart = { text: 'Transcribe the following audio:' };

        return getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: { parts: [audioPart, textPart] },
        });
    },

    analyzeDocument: async (text: string, prompt: string): Promise<GenerateContentResponse> => {
        return getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `${prompt}\n\nDocument content:\n${text}`,
        });
    },

    groundedSearch: async (prompt: string, useMaps: boolean, location?: {latitude: number, longitude: number}): Promise<GenerateContentResponse> => {
        const tools: any[] = [{ googleSearch: {} }];
        const toolConfig: any = {};
        
        if (useMaps) {
            tools.push({ googleMaps: {} });
            if (location) {
                toolConfig.retrievalConfig = {
                    latLng: location,
                }
            }
        }

        return getAi().models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                tools,
                ...(Object.keys(toolConfig).length > 0 && { toolConfig }),
            },
        });
    },

    complexReasoning: async (prompt: string): Promise<GenerateContentResponse> => {
        return getAi().models.generateContent({
            model: 'gemini-2.5-pro',
            contents: prompt,
            config: {
                thinkingConfig: {
                    thinkingBudget: 32768,
                },
            },
        });
    },

    connectLive: (callbacks: LiveCallbacks, tools?: { functionDeclarations: FunctionDeclaration[] }[]) => {
        return getAi().live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            callbacks,
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { prebuiltVoiceConfig: { voiceName: 'Zephyr' } },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: `You are a friendly and helpful AI assistant. You can control the app to help the user.
- You have access to a document library. You can see what's available with the 'listDocuments' tool.
- You can analyze images, videos, audio, and documents. Use the 'analyzeFile' tool. For files in the library, specify the 'fileName'. If the user uploads a file during our conversation, you can analyze it without the 'fileName'. If the user asks to analyze something without uploading or specifying a file, ask them to do so.
- You can search the web and maps using the 'searchWeb' tool. After a search, you can read the content of one of the results if the user asks. Use the 'readWebsiteContent' tool with a topic from the search result titles.
- If the user has uploaded a video or audio file, you can control its playback using the 'controlMediaPlayer' tool. You can play, pause, stop, seek to a specific time in seconds, and set the volume between 0.0 and 1.0.
- Keep your spoken responses conversational and concise. Announce when you are performing an action, like "Searching the web..." or "Okay, reading the article..." or "Let me check that document for you."`,
                ...(tools && { tools }),
            },
        });
    }
};