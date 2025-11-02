import React from 'react';
import FeatureLayout from './common/FeatureLayout';
import { formatBytes } from '../utils/helpers';
import { FileTextIcon } from '../components/Icons';

interface DocumentLibraryProps {
    documents: File[];
    setDocuments: React.Dispatch<React.SetStateAction<File[]>>;
}

const DocumentLibrary: React.FC<DocumentLibraryProps> = ({ documents, setDocuments }) => {
    
    const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const newFiles = Array.from(files);
            // Prevent duplicates by creating a Set of existing file names for efficient lookup.
            const existingFileNames = new Set(documents.map(doc => doc.name));
            // FIX: Explicitly type `nf` as `File` to help TypeScript correctly infer its type from the FileList, resolving the error.
            const uniqueNewFiles = newFiles.filter((nf: File) => !existingFileNames.has(nf.name));
            setDocuments(prev => [...prev, ...uniqueNewFiles]);
        }
    };
    
    const handleRemoveDocument = (fileName: string) => {
        setDocuments(prev => prev.filter(file => file.name !== fileName));
    };

    return (
        <FeatureLayout
            title="Document Library"
            description="Upload and manage your documents here. They will be available for the AI to analyze in other features."
        >
            <div className="max-w-4xl mx-auto">
                <div className="w-full p-8 border-2 border-dashed border-slate-600 rounded-lg text-center mb-8 bg-slate-800/50 hover:border-blue-500 transition-colors">
                    <input
                        type="file"
                        accept=".txt,.pdf"
                        onChange={handleFileChange}
                        className="hidden"
                        id="doc-library-upload"
                        multiple
                    />
                    <label htmlFor="doc-library-upload" className="cursor-pointer">
                        <div className="flex flex-col items-center">
                            <FileTextIcon />
                            <p className="mt-2 text-lg font-semibold text-slate-300">Click to upload or drag and drop</p>
                            <p className="text-sm text-slate-500">TXT or PDF files</p>
                        </div>
                    </label>
                </div>

                <div>
                    <h2 className="text-2xl font-bold mb-4">Uploaded Documents</h2>
                    {documents.length === 0 ? (
                        <p className="text-slate-500">No documents uploaded yet. Upload a document to get started.</p>
                    ) : (
                        <ul className="space-y-3">
                            {documents.map(doc => (
                                <li key={doc.name} className="flex items-center justify-between p-4 bg-slate-800 rounded-lg">
                                    <div className="flex items-center space-x-4">
                                        <FileTextIcon />
                                        <div>
                                            <p className="font-semibold text-slate-200">{doc.name}</p>
                                            <p className="text-sm text-slate-400">{formatBytes(doc.size)}</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => handleRemoveDocument(doc.name)}
                                        className="text-red-400 hover:text-red-600 font-semibold transition-colors"
                                    >
                                        Remove
                                    </button>
                                </li>
                            ))}
                        </ul>
                    )}
                </div>
            </div>
        </FeatureLayout>
    );
};

export default DocumentLibrary;