import React from 'react';
import FeatureLayout from './common/FeatureLayout';
import { formatBytes } from '../utils/helpers';
import { FileTextIcon } from '../components/Icons';
import { dbService } from '../services/dbService';

interface DocumentLibraryProps {
    documents: File[];
    setDocuments: React.Dispatch<React.SetStateAction<File[]>>;
}

const DocumentLibrary: React.FC<DocumentLibraryProps> = ({ documents, setDocuments }) => {
    
    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (files) {
            const newFiles = Array.from(files);
            const existingFileNames = new Set(documents.map(doc => doc.name));
            const uniqueNewFiles = newFiles.filter((nf: File) => !existingFileNames.has(nf.name));

            if (uniqueNewFiles.length > 0) {
                 try {
                    await Promise.all(uniqueNewFiles.map(file => dbService.addDocument(file)));
                    // FIX: The `documents` prop (and thus `prev`) can contain plain objects from IndexedDB
                    // that are not true `File` instances, causing a type error when concatenated with new `File` objects.
                    // Reconstruct `File` objects from `prev` to ensure type consistency.
                    setDocuments(prev => {
                        const prevAsFiles = prev.map(p => {
                            if (p instanceof File) {
                                return p;
                            }
                            // Reconstruct File from the plain object-like blob from IndexedDB
                            const fileLike = p as any;
                            return new File([fileLike], fileLike.name, { type: fileLike.type, lastModified: fileLike.lastModified });
                        });
                        return [...prevAsFiles, ...uniqueNewFiles];
                    });
                } catch (error) {
                    console.error("Failed to add documents to DB:", error);
                    alert("Could not save all documents. Please try again.");
                }
            }
        }
    };
    
    const handleRemoveDocument = async (fileName: string) => {
        try {
            await dbService.removeDocument(fileName);
            setDocuments(prev => prev.filter(file => file.name !== fileName));
        } catch (error) {
            console.error(`Failed to remove document ${fileName}:`, error);
            alert("Could not remove document. Please try again.");
        }
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