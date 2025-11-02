
import React, { useState } from 'react';
import type { Feature, FeatureId } from './types';
import {
  MessageSquareIcon,
  ImageIcon,
  VideoIcon,
  MicIcon,
  FileTextIcon,
  GlobeIcon,
  BrainCircuitIcon,
  SparklesIcon,
  RadioTowerIcon,
  FilesIcon
} from './components/Icons';
import LiveConversation from './features/LiveConversation';
import ChatBot from './features/ChatBot';
import ImageAnalysis from './features/ImageAnalysis';
import ImageGeneration from './features/ImageGeneration';
import VideoAnalysis from './features/VideoAnalysis';
import AudioTranscription from './features/AudioTranscription';
import DocumentAnalysis from './features/DocumentAnalysis';
import DocumentLibrary from './features/DocumentLibrary';
import GroundingSearch from './features/GroundingSearch';
import ComplexReasoning from './features/ComplexReasoning';


const features: Feature[] = [
  { id: 'live', name: 'Live Conversation', description: 'Speak with Gemini in real-time.', icon: <RadioTowerIcon />, component: LiveConversation },
  { id: 'chat', name: 'Chat', description: 'Have a text-based conversation.', icon: <MessageSquareIcon />, component: ChatBot },
  { id: 'reasoning', name: 'Complex Reasoning', description: 'Tackle complex problems with Thinking Mode.', icon: <BrainCircuitIcon />, component: ComplexReasoning },
  { id: 'grounding', name: 'Grounded Search', description: 'Get up-to-date answers from the web & maps.', icon: <GlobeIcon />, component: GroundingSearch },
  { id: 'image-analysis', name: 'Image Analysis', description: 'Understand the content of your images.', icon: <ImageIcon />, component: ImageAnalysis },
  { id: 'image-gen', name: 'Image Generation', description: 'Create stunning visuals from text.', icon: <SparklesIcon />, component: ImageGeneration },
  { id: 'video-analysis', name: 'Video Analysis', description: 'Extract insights from video files.', icon: <VideoIcon />, component: VideoAnalysis },
  { id: 'audio-transcription', name: 'Audio Transcription', description: 'Transcribe spoken words from audio files.', icon: <MicIcon />, component: AudioTranscription },
  { id: 'document-analysis', name: 'Document Analysis', description: 'Summarize and analyze single documents.', icon: <FileTextIcon />, component: DocumentAnalysis },
  { id: 'document-library', name: 'Document Library', description: 'Manage documents for AI analysis.', icon: <FilesIcon />, component: DocumentLibrary },
];

const App: React.FC = () => {
  const [activeFeature, setActiveFeature] = useState<FeatureId>('live');
  const [documents, setDocuments] = useState<File[]>([]);

  const renderFeature = () => {
    const feature = features.find(f => f.id === activeFeature);
    if (!feature) return null;

    const props: any = { key: feature.id };
    
    // Pass shared document state to relevant features
    if (feature.id === 'live' || feature.id === 'document-library') {
      props.documents = documents;
      props.setDocuments = setDocuments;
    }
    
    return React.createElement(feature.component, props);
  };

  return (
    <div className="flex h-screen bg-slate-900 text-slate-100 font-sans">
      <nav className="w-16 md:w-64 bg-slate-950 p-2 md:p-4 flex flex-col space-y-2 border-r border-slate-800 transition-all duration-300 overflow-y-auto">
        <div className="flex items-center space-x-2 mb-6 md:px-2 flex-shrink-0">
            <svg className="w-8 h-8 text-brand-primary" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M12.85 3.12L12.85 3.12C12.44 2.45 11.56 2.45 11.15 3.12L3.19 16.88C2.78 17.55 3.22 18.4 3.96 18.4H20.04C20.78 18.4 21.22 17.55 20.81 16.88L12.85 3.12Z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path><path d="M7 18.4L12 10.4L17 18.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
          <h1 className="text-xl font-bold hidden md:block">AI Studio</h1>
        </div>
        <div className="flex-grow">
        {features.map(feature => (
          <button
            key={feature.id}
            onClick={() => setActiveFeature(feature.id)}
            className={`flex items-center space-x-3 p-2 rounded-lg transition-colors w-full text-left mb-1 ${
              activeFeature === feature.id
                ? 'bg-blue-600/30 text-white'
                : 'hover:bg-slate-800 text-slate-400'
            }`}
          >
            <div className="w-6 h-6 flex-shrink-0">{feature.icon}</div>
            <span className="hidden md:inline">{feature.name}</span>
          </button>
        ))}
        </div>
      </nav>

      <main className="flex-1 flex flex-col overflow-hidden">
        {renderFeature()}
      </main>
    </div>
  );
};

export default App;
