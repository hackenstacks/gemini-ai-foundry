
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';
import { fileToBase64, formatBytes } from '../utils/helpers';
import FeatureLayout from './common/FeatureLayout';
import Spinner from '../components/Spinner';
import MarkdownRenderer from '../components/MarkdownRenderer';

const VideoAnalysis: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [prompt, setPrompt] = useState<string>('Summarize this video.');
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');
    const videoRef = React.useRef<HTMLVideoElement>(null);

    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResult('');
            setError('');
             if (videoRef.current) {
                videoRef.current.src = URL.createObjectURL(selectedFile);
            }
        }
    };

    const handleAnalyze = async () => {
        if (!file || !prompt) {
            setError('Please select a video and enter a prompt.');
            return;
        }
        if (file.size > 10 * 1024 * 1024) { // 10MB limit for client-side demo
            setError('File is too large. Please upload a video under 10MB for this demo.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult('');
        try {
            const videoBase64 = await fileToBase64(file);
            const response = await GeminiService.analyzeVideo(prompt, videoBase64, file.type);
            setResult(response.text);
        } catch (err: any) {
            console.error(err);
            setError('Failed to analyze video. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Video Analysis" description="Upload a short video (<10MB) and let Gemini Pro provide insights.">
            <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Summarize this video."
                        className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        rows={3}
                    />
                    <div className="w-full p-6 border-2 border-dashed border-slate-600 rounded-lg text-center">
                        <input
                            type="file"
                            accept="video/*"
                            onChange={handleFileChange}
                            className="hidden"
                            id="video-upload"
                        />
                        <label htmlFor="video-upload" className="cursor-pointer text-blue-400 hover:text-blue-500 font-semibold">
                            {file ? 'Change video' : 'Choose a video'}
                        </label>
                        {file && <p className="text-sm text-slate-400 mt-2">{file.name} ({formatBytes(file.size)})</p>}
                    </div>

                    {file && (
                        <div className="mt-4 bg-black rounded-lg">
                            <video ref={videoRef} controls className="max-w-full max-h-64 rounded-lg mx-auto" />
                        </div>
                    )}
                    
                    <button
                        onClick={handleAnalyze}
                        disabled={!file || !prompt || isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? 'Analyzing...' : 'Analyze Video'}
                    </button>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 h-[60vh] overflow-y-auto">
                    {isLoading && <div className="flex items-center justify-center h-full"><Spinner /></div>}
                    {error && <p className="text-red-400">{error}</p>}
                    {result && <MarkdownRenderer content={result} />}
                    {!isLoading && !result && !error && <div className="flex items-center justify-center h-full text-slate-500">Video analysis results will appear here.</div>}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default VideoAnalysis;
