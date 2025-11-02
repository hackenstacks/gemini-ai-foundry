
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';
import { fileToBase64, formatBytes } from '../utils/helpers';
import FeatureLayout from './common/FeatureLayout';
import Spinner from '../components/Spinner';

const AudioTranscription: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const audioRef = React.useRef<HTMLAudioElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResult('');
            setError('');
            if (audioRef.current) {
                audioRef.current.src = URL.createObjectURL(selectedFile);
            }
        }
    };

    const handleTranscribe = async () => {
        if (!file) {
            setError('Please select an audio file.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult('');
        try {
            const audioBase64 = await fileToBase64(file);
            const response = await GeminiService.transcribeAudio(audioBase64, file.type);
            setResult(response.text);
        } catch (err: any) {
            console.error(err);
            setError('Failed to transcribe audio. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Audio Transcription" description="Upload an audio file and Gemini will transcribe the speech into text.">
            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                     <div className="w-full p-6 border-2 border-dashed border-slate-600 rounded-lg text-center">
                        <input
                            type="file"
                            accept="audio/*"
                            onChange={handleFileChange}
                            className="hidden"
                            id="audio-upload"
                        />
                        <label htmlFor="audio-upload" className="cursor-pointer text-blue-400 hover:text-blue-500 font-semibold">
                            {file ? 'Change audio file' : 'Choose an audio file'}
                        </label>
                        {file && <p className="text-sm text-slate-400 mt-2">{file.name} ({formatBytes(file.size)})</p>}
                    </div>

                    {file && (
                        <div className="mt-4">
                           <audio ref={audioRef} controls className="w-full" />
                        </div>
                    )}
                    
                    <button
                        onClick={handleTranscribe}
                        disabled={!file || isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? 'Transcribing...' : 'Transcribe Audio'}
                    </button>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 h-[60vh] overflow-y-auto">
                    {isLoading && <div className="flex items-center justify-center h-full"><Spinner /></div>}
                    {error && <p className="text-red-400">{error}</p>}
                    {result && <p className="text-slate-200 whitespace-pre-wrap">{result}</p>}
                    {!isLoading && !result && !error && <div className="flex items-center justify-center h-full text-slate-500">Transcription will appear here.</div>}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default AudioTranscription;
