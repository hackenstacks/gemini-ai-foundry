
import React, { useState } from 'react';
import { GeminiService } from '../services/geminiService';
import FeatureLayout from './common/FeatureLayout';
import Spinner from '../components/Spinner';

const aspectRatios = ["1:1", "16:9", "9:16", "4:3", "3:4"];

const ImageGeneration: React.FC = () => {
    const [prompt, setPrompt] = useState<string>('A photorealistic image of a futuristic city on a distant planet, with flying cars and glowing skyscrapers.');
    const [aspectRatio, setAspectRatio] = useState<string>("16:9");
    const [generatedImages, setGeneratedImages] = useState<string[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const [error, setError] = useState<string>('');

    const handleGenerate = async () => {
        if (!prompt) {
            setError('Please enter a prompt.');
            return;
        }
        setIsLoading(true);
        setError('');
        setGeneratedImages([]);
        try {
            const imagesBase64 = await GeminiService.generateImage(prompt, aspectRatio);
            setGeneratedImages(imagesBase64);
        } catch (err: any) {
            console.error(err);
            setError('Failed to generate image. ' + err.message);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <FeatureLayout title="Image Generation" description="Create stunning images from your text descriptions using the Imagen model.">
            <div className="flex flex-col h-full">
                <div className="w-full max-w-4xl mx-auto space-y-4">
                    <textarea
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                        placeholder="Enter a detailed prompt..."
                        className="w-full p-3 bg-slate-800 border border-slate-700 rounded-lg focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        rows={4}
                    />
                    <div className="flex items-center space-x-4">
                        <label htmlFor="aspect-ratio" className="text-slate-300">Aspect Ratio:</label>
                        <select
                            id="aspect-ratio"
                            value={aspectRatio}
                            onChange={(e) => setAspectRatio(e.target.value)}
                            className="bg-slate-800 border border-slate-700 rounded-lg p-2 focus:ring-2 focus:ring-blue-500 focus:outline-none"
                        >
                            {aspectRatios.map(ar => <option key={ar} value={ar}>{ar}</option>)}
                        </select>
                        <button
                            onClick={handleGenerate}
                            disabled={!prompt || isLoading}
                            className="flex-grow bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-2 px-4 rounded-lg transition-colors"
                        >
                            {isLoading ? 'Generating...' : 'Generate Image'}
                        </button>
                    </div>
                </div>

                <div className="flex-grow mt-8 flex items-center justify-center bg-slate-800/50 rounded-lg p-4 min-h-[50vh]">
                    {isLoading && <Spinner text="Generating image... this can take a moment." />}
                    {error && <p className="text-red-400">{error}</p>}
                    {!isLoading && !error && generatedImages.length === 0 && (
                         <p className="text-slate-500">Your generated image will appear here.</p>
                    )}
                    {generatedImages.map((imageBase64, index) => (
                        <img
                            key={index}
                            src={`data:image/jpeg;base64,${imageBase64}`}
                            alt={`Generated image for prompt: ${prompt}`}
                            className="max-w-full max-h-full object-contain rounded-lg"
                        />
                    ))}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default ImageGeneration;
