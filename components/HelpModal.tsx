
import React from 'react';
import { XIcon } from './Icons';

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpContent = [
    {
      title: 'Live Conversation',
      content: 'Engage in a real-time voice conversation with Gemini. You can ask it to perform various tasks like searching the web, analyzing uploaded files, or controlling media playback. Just click "Start Conversation" and speak naturally. You can upload an image, video, or audio file for the AI to analyze during the conversation.'
    },
    {
      title: 'Chat',
      content: 'Have a classic text-based chat with Gemini. It remembers the context of your conversation. For very long chats, it will automatically summarize the history to ensure it doesn\'t forget earlier parts of the discussion.'
    },
    {
      title: 'Complex Reasoning',
      content: 'Tackle difficult problems that require advanced reasoning. This mode uses Gemini Pro with "Thinking Mode" enabled, giving it more time and resources to think through complex prompts before answering.'
    },
    {
      title: 'Grounded Search',
      content: 'Get up-to-date answers from the web. This feature grounds Gemini\'s responses in real-time information from Google Search. You can also enable Google Maps to get location-based results. All sources are cited.'
    },
    {
      title: 'Image Analysis',
      content: 'Upload an image and ask questions about it. Gemini can describe what\'s in the image, identify objects, read text, and more.'
    },
    {
      title: 'Image Generation',
      content: 'Create unique images from text prompts using the Imagen model. Describe what you want to see, choose an aspect ratio, and let the AI bring your vision to life.'
    },
    {
      title: 'Video Analysis',
      content: 'Upload a short video file. Gemini can summarize the video, describe scenes, and answer questions about its content. Note: For this demo, please use videos under 10MB.'
    },
    {
      title: 'Audio Transcription',
      content: 'Upload an audio file and Gemini will transcribe the spoken words into text.'
    },
    {
      title: 'Document Analysis',
      content: 'Upload a TXT or PDF file to have Gemini analyze its content. You can ask for summaries, key takeaways, or specific information within the document.'
    },
    {
      title: 'Document Library',
      content: 'This is your personal file cabinet. Upload documents here, and they become available for the AI to access and analyze in other features, like the Live Conversation. This allows you to build a knowledge base for the AI to work with.'
    }
];


const HelpModal: React.FC<HelpModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

  return (
    <div 
        className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4 transition-opacity duration-300" 
        onClick={onClose}
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-modal-title"
    >
      <div 
        className="bg-slate-900 border border-slate-700 rounded-2xl shadow-xl w-full max-w-3xl max-h-[90vh] flex flex-col" 
        onClick={e => e.stopPropagation()}
      >
        <header className="flex items-center justify-between p-6 border-b border-slate-800 flex-shrink-0">
          <h2 id="help-modal-title" className="text-2xl font-bold text-white">Application Guide</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors" aria-label="Close help modal">
            <XIcon />
          </button>
        </header>
        <main className="p-8 overflow-y-auto space-y-8">
          <p className="text-slate-400">Welcome to the AI Studio! This guide provides an overview of each feature available in the application.</p>
          {helpContent.map(item => (
            <div key={item.title}>
              <h3 className="text-xl font-semibold text-brand-primary mb-2">{item.title}</h3>
              <p className="text-slate-300 leading-relaxed">{item.content}</p>
            </div>
          ))}
        </main>
      </div>
    </div>
  );
};

export default HelpModal;
