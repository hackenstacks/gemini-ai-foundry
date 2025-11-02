
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';
import FeatureLayout from './common/FeatureLayout';
import Spinner from '../components/Spinner';
import MarkdownRenderer from '../components/MarkdownRenderer';

const ComplexReasoning: React.FC = () => {
    const [prompt, setPrompt] = useState<string>('Explain the concept of quantum entanglement to a high school student, including an analogy to help with understanding.');
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const handleQuery = async () => {
        if (!prompt) {
            setError('Please enter a prompt.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult('');
        try {
            const response = await GeminiService.complexReasoning(prompt);
            setResult(response.text);
        } catch (err: any) {
            console.error(err);
            setError('An error occurred. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Complex Reasoning" description="Leverage Gemini Pro with Thinking Mode to solve difficult problems and answer complex questions.">
            <div className="max-w-4xl mx-auto space-y-4">
                <textarea
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Enter a complex prompt..."
                    className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                    rows={5}
                />
                <button
                    onClick={handleQuery}
                    disabled={isLoading}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                >
                    {isLoading ? 'Thinking...' : 'Submit Query'}
                </button>

                <div className="bg-slate-800/50 rounded-lg p-4 min-h-[50vh] mt-6">
                    {isLoading && <div className="flex items-center justify-center h-full"><Spinner text="Thinking... this may take some time for complex queries." /></div>}
                    {error && <p className="text-red-400">{error}</p>}
                    {result && <MarkdownRenderer content={result} />}
                    {!isLoading && !result && !error && <div className="flex items-center justify-center h-full text-slate-500">The model's reasoning will appear here.</div>}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default ComplexReasoning;
