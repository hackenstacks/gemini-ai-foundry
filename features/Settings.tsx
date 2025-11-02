
import React, { useState } from 'react';
import FeatureLayout from './common/FeatureLayout';
import { dbService } from '../services/dbService';
import { DownloadIcon, UploadIcon } from '../components/Icons';

const Settings: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);

    const handleExport = async () => {
        setIsExporting(true);
        setError(null);
        setSuccess(null);
        try {
            const data = await dbService.exportData();
            const dataString = JSON.stringify(data, null, 2);
            const blob = new Blob([dataString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `gemini-ai-studio-backup-${new Date().toISOString().split('T')[0]}.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);
            setSuccess('Data exported successfully!');
        } catch (e: any) {
            console.error("Export failed:", e);
            setError(`Export failed: ${e.message}`);
        } finally {
            setIsExporting(false);
        }
    };

    const handleImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        if (!window.confirm("Importing data will overwrite all current files and chat history. This cannot be undone. Are you sure you want to continue?")) {
            return;
        }

        setIsImporting(true);
        setError(null);
        setSuccess(null);
        try {
            const content = await file.text();
            const data = JSON.parse(content);
            await dbService.importData(data);
            setSuccess('Import successful! The application will now reload.');
            setTimeout(() => {
                window.location.reload();
            }, 2000);
        } catch (e: any) {
            console.error("Import failed:", e);
            setError(`Import failed: ${e.message}. The file may be corrupt or in the wrong format.`);
        } finally {
            setIsImporting(false);
        }
    };

    return (
        <FeatureLayout title="Settings" description="Manage your application data, including backup and restore options.">
            <div className="max-w-2xl mx-auto space-y-8">
                <div className="bg-slate-800/50 rounded-lg p-6">
                    <h2 className="text-xl font-bold mb-3 text-white">Data Backup & Restore</h2>
                    <p className="text-slate-400 mb-6">
                        Export all your data, including the file library and chat history, into a single encrypted JSON file.
                        You can import this file later to restore your application state.
                    </p>
                    
                    {error && <p className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4">{error}</p>}
                    {success && <p className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4">{success}</p>}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={handleExport}
                            disabled={isExporting || isImporting}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <DownloadIcon />
                            {isExporting ? 'Exporting...' : 'Export Data'}
                        </button>
                        
                        <input
                            type="file"
                            id="import-file"
                            accept=".json"
                            onChange={handleImport}
                            className="hidden"
                            disabled={isImporting || isExporting}
                        />
                        <label
                            htmlFor="import-file"
                            className={`flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2 ${isImporting || isExporting ? 'cursor-not-allowed bg-slate-600' : 'cursor-pointer'}`}
                        >
                            <UploadIcon />
                            {isImporting ? 'Importing...' : 'Import Data'}
                        </label>
                    </div>
                </div>
            </div>
        </FeatureLayout>
    );
};

export default Settings;
