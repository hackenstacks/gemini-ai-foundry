
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';
import { formatBytes } from '../utils/helpers';
import FeatureLayout from './common/FeatureLayout';
import Spinner from '../components/Spinner';
import MarkdownRenderer from '../components/MarkdownRenderer';

const DocumentAnalysis: React.FC = () => {
    const [file, setFile] = useState<File | null>(null);
    const [fileContent, setFileContent] = useState<string>('');
    const [prompt, setPrompt] = useState<string>('Summarize this document in three key bullet points.');
    const [result, setResult] = useState<string>('');
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (selectedFile) {
            setFile(selectedFile);
            setResult('');
            setError('');
            setIsLoading(true);
            try {
                if (selectedFile.type === 'application/pdf') {
                    const reader = new FileReader();
                    reader.onload = async (event) => {
                        const pdfData = new Uint8Array(event.target?.result as ArrayBuffer);
                        const pdf = await window.pdfjsLib.getDocument({ data: pdfData }).promise;
                        let textContent = '';
                        for (let i = 1; i <= pdf.numPages; i++) {
                            const page = await pdf.getPage(i);
                            const text = await page.getTextContent();
                            textContent += text.items.map((s: any) => s.str).join(' ');
                        }
                        setFileContent(textContent);
                    };
                    reader.readAsArrayBuffer(selectedFile);
                } else {
                    const text = await selectedFile.text();
                    setFileContent(text);
                }
            } catch (err) {
                setError('Could not read file content.');
                console.error(err);
            } finally {
                setIsLoading(false);
            }
        }
    };

    const handleAnalyze = async () => {
        if (!fileContent || !prompt) {
            setError('Please upload a document and enter a prompt.');
            return;
        }
        setIsLoading(true);
        setError('');
        setResult('');
        try {
            const response = await GeminiService.analyzeDocument(fileContent, prompt);
            setResult(response.text);
        } catch (err: any) {
            console.error(err);
            setError('Failed to analyze document. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Document Analysis" description="Upload a TXT or PDF file to summarize, analyze, or ask questions about its content.">
             <div className="grid md:grid-cols-2 gap-8">
                <div className="space-y-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="e.g., Summarize this document..."
                        className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        rows={3}
                    />
                    <div className="w-full p-6 border-2 border-dashed border-slate-600 rounded-lg text-center">
                        <input
                            type="file"
                            accept=".txt,.pdf"
                            onChange={handleFileChange}
                            className="hidden"
                            id="doc-upload"
                        />
                        <label htmlFor="doc-upload" className="cursor-pointer text-blue-400 hover:text-blue-500 font-semibold">
                           {file ? 'Change document' : 'Choose a TXT or PDF file'}
                        </label>
                        {file && <p className="text-sm text-slate-400 mt-2">{file.name} ({formatBytes(file.size)})</p>}
                    </div>
                     <button
                        onClick={handleAnalyze}
                        disabled={!fileContent || !prompt || isLoading}
                        className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors"
                    >
                        {isLoading ? 'Analyzing...' : 'Analyze Document'}
                    </button>
                </div>
                <div className="bg-slate-800/50 rounded-lg p-4 h-[60vh] overflow-y-auto">
                    {isLoading && <div className="flex items-center justify-center h-full"><Spinner /></div>}
                    {error && <p className="text-red-400">{error}</p>}
                    {result && <MarkdownRenderer content={result} />}
                    {!isLoading && !result && !error && <div className="flex items-center justify-center h-full text-slate-500">Analysis results will appear here.</div>}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default DocumentAnalysis;
