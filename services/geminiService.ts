
import { GoogleGenAI, Type, Modality, Chat, GenerateContentResponse, GroundingChunk, LiveServerMessage } from '@google/genai';

let ai: GoogleGenAI;

const getAi = (): GoogleGenAI => {
    if (!ai) {
        if (!process.env.API_KEY) {
            console.error("API_KEY environment variable not set.");
            throw new Error("API key is missing.");
        }
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
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

    connectLive: (callbacks: LiveCallbacks) => {
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
                systemInstruction: 'You are a friendly and helpful AI assistant. Keep your responses conversational and concise.',
            },
        });
    }
};
