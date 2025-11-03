import React, { useState, useEffect } from 'react';
import FeatureLayout from './common/FeatureLayout';
import { dbService } from '../services/dbService';
import { DownloadIcon, UploadIcon, EditIcon, TrashIcon } from '../components/Icons';
import { Persona } from '../types';
import PersonaConfigModal from './common/PersonaConfigModal';

const voices = ['Zephyr', 'Puck', 'Charon', 'Kore', 'Fenrir'];

const Settings: React.FC = () => {
    const [isExporting, setIsExporting] = useState(false);
    const [isImporting, setIsImporting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [success, setSuccess] = useState<string | null>(null);
    const [personas, setPersonas] = useState<Persona[]>([]);
    const [selectedVoice, setSelectedVoice] = useState<string>('Zephyr');
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPersona, setEditingPersona] = useState<Persona | null>(null);

    useEffect(() => {
        const loadSettings = async () => {
            try {
                const [savedPersonas, savedVoice] = await Promise.all([
                    dbService.getPersonas(),
                    dbService.getVoicePreference()
                ]);
                setPersonas(savedPersonas);
                if (savedVoice) {
                    setSelectedVoice(savedVoice);
                }
            } catch (e: any) {
                setError(`Failed to load settings: ${e.message}`);
            }
        };
        loadSettings();
    }, []);

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

        if (!window.confirm("Importing data will overwrite all current files and chat settings. This cannot be undone. Are you sure you want to continue?")) {
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

    const handleVoiceChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const newVoice = e.target.value;
        setSelectedVoice(newVoice);
        try {
            await dbService.saveVoicePreference(newVoice);
        } catch (e: any) {
            setError(`Failed to save voice preference: ${e.message}`);
        }
    };

    const handleAddNewPersona = () => {
        setEditingPersona({
            id: crypto.randomUUID(),
            role: 'New Persona',
            personalityTraits: '',
            characterDescription: '',
            scenario: '',
            systemPrompt: '',
            avatarUrl: '',
        });
        setIsModalOpen(true);
    };

    const handleEditPersona = (persona: Persona) => {
        setEditingPersona(persona);
        setIsModalOpen(true);
    };

    const handleSavePersona = async (personaToSave: Persona) => {
        const isNew = !personas.some(p => p.id === personaToSave.id);
        const updatedPersonas = isNew ? [...personas, personaToSave] : personas.map(p => p.id === personaToSave.id ? personaToSave : p);
        
        // If it's the only persona, make it active
        if (updatedPersonas.length === 1) {
            updatedPersonas[0].isActive = true;
        }

        setPersonas(updatedPersonas);
        await dbService.savePersonas(updatedPersonas);
        setIsModalOpen(false);
        setEditingPersona(null);
    };

    const handleDeletePersona = async (personaId: string) => {
        if (!window.confirm("Are you sure you want to delete this persona?")) return;

        const personaToDelete = personas.find(p => p.id === personaId);
        const updatedPersonas = personas.filter(p => p.id !== personaId);

        // If the deleted persona was active, make another one active
        if (personaToDelete?.isActive && updatedPersonas.length > 0) {
            updatedPersonas[0].isActive = true;
        }

        setPersonas(updatedPersonas);
        await dbService.savePersonas(updatedPersonas);
    };

    const handleSetActive = async (personaId: string) => {
        const updatedPersonas = personas.map(p => ({
            ...p,
            isActive: p.id === personaId,
        }));
        setPersonas(updatedPersonas);
        await dbService.savePersonas(updatedPersonas);
    };
    
    const handleExportPersonas = () => {
        const dataString = JSON.stringify(personas, null, 2);
        const blob = new Blob([dataString], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `gemini-personas-backup.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleImportPersonas = (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = async (e) => {
            try {
                const imported = JSON.parse(e.target?.result as string) as Persona[];
                // Simple validation
                if (!Array.isArray(imported) || !imported.every(p => p.id && p.role)) {
                    throw new Error("Invalid persona file format.");
                }
                const combined = [...personas];
                imported.forEach(p => {
                    if (!combined.some(existing => existing.id === p.id)) {
                        combined.push({ ...p, isActive: false }); // Ensure imported are not active
                    }
                });
                setPersonas(combined);
                await dbService.savePersonas(combined);
                setSuccess(`${imported.length} personas imported successfully!`);
            } catch (err: any) {
                setError(`Import failed: ${err.message}`);
            }
        };
        reader.readAsText(file);
        event.target.value = ''; // Reset file input
    };

    return (
        <FeatureLayout title="Settings" description="Manage your application data, chatbot personas, and voice preferences.">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 {/* Persona Management */}
                <div className="bg-slate-800/50 rounded-lg p-6 flex flex-col h-96">
                    <h2 className="text-xl font-bold mb-3 text-white">Persona Management</h2>
                    <div className="flex-grow overflow-y-auto pr-2 space-y-2">
                        {personas.length > 0 ? personas.map(p => (
                            <div key={p.id} className={`p-3 rounded-lg flex items-center justify-between ${p.isActive ? 'bg-blue-900/50 ring-1 ring-blue-500' : 'bg-slate-700/50'}`}>
                                <div>
                                    <p className="font-semibold">{p.role}</p>
                                    <p className="text-xs text-slate-400 truncate max-w-xs">{p.personalityTraits}</p>
                                </div>
                                <div className="flex items-center space-x-2">
                                    {!p.isActive && <button onClick={() => handleSetActive(p.id)} className="text-xs bg-green-600 hover:bg-green-700 text-white font-bold py-1 px-2 rounded">Apply</button>}
                                    <button onClick={() => handleEditPersona(p)} className="p-2 hover:bg-slate-600 rounded"><EditIcon/></button>
                                    <button onClick={() => handleDeletePersona(p.id)} className="p-2 hover:bg-red-600 rounded"><TrashIcon/></button>
                                </div>
                            </div>
                        )) : <p className="text-slate-500 text-center mt-8">No personas created yet.</p>}
                    </div>
                    <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={handleAddNewPersona} className="flex-1 bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-3 rounded-lg text-sm">Create New</button>
                        <button onClick={handleExportPersonas} disabled={personas.length === 0} className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-3 rounded-lg text-sm disabled:opacity-50">Export</button>
                        <input type="file" id="import-personas" accept=".json" onChange={handleImportPersonas} className="hidden" />
                        <label htmlFor="import-personas" className="flex-1 bg-slate-600 hover:bg-slate-500 text-white font-bold py-2 px-3 rounded-lg text-sm cursor-pointer text-center">Import</label>
                    </div>
                </div>

                {/* Voice Selection */}
                <div className="bg-slate-800/50 rounded-lg p-6 flex flex-col h-96">
                    <h2 className="text-xl font-bold mb-3 text-white">Live Conversation Voice</h2>
                    <p className="text-slate-400 mb-6">Choose the voice Gemini will use during live conversations.</p>
                    <select value={selectedVoice} onChange={handleVoiceChange} className="w-full bg-slate-800 border border-slate-700 rounded-lg p-3 focus:ring-2 focus:ring-blue-500 focus:outline-none">
                        {voices.map(voice => <option key={voice} value={voice}>{voice}</option>)}
                    </select>
                </div>
                
                {/* Data Backup */}
                <div className="bg-slate-800/50 rounded-lg p-6 flex flex-col h-96">
                    <h2 className="text-xl font-bold mb-3 text-white">Data Backup & Restore</h2>
                    <p className="text-slate-400 mb-6">
                        Export all your application data, including files and chat history, into a single encrypted JSON file.
                        You can import this file later to restore your application state.
                    </p>
                    <div className="flex-grow" />
                    {error && <p className="bg-red-900/50 text-red-300 p-3 rounded-md mb-4">{error}</p>}
                    {success && <p className="bg-green-900/50 text-green-300 p-3 rounded-md mb-4">{success}</p>}

                    <div className="flex flex-col sm:flex-row gap-4">
                        <button
                            onClick={handleExport}
                            disabled={isExporting || isImporting}
                            className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-600 text-white font-bold py-3 px-4 rounded-lg transition-colors flex items-center justify-center gap-2"
                        >
                            <DownloadIcon />
                            {isExporting ? 'Exporting...' : 'Export All Data'}
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
                            {isImporting ? 'Importing...' : 'Import All Data'}
                        </label>
                    </div>
                </div>
            </div>
            {isModalOpen && editingPersona && (
                 <PersonaConfigModal
                    isOpen={isModalOpen}
                    onClose={() => setIsModalOpen(false)}
                    initialPersona={editingPersona}
                    onSave={handleSavePersona}
                 />
            )}
        </FeatureLayout>
    );
};

export default Settings;