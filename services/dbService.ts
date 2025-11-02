
import { ChatMessage } from '../types';
import { cryptoService } from './cryptoService';
import { fileToBase64, base64ToBlob } from '../utils/helpers';

const DB_NAME = 'GeminiAIStudioDB';
const DB_VERSION = 2; // Incremented version for schema change
const FILE_STORE = 'files';
const CHAT_STORE = 'chatHistory';

let dbInstance: IDBDatabase | null = null;

export interface StoredFile {
    name: string;
    type: string;
    size: number;
    lastModified: number;
    isArchived: boolean;
    data: string; // base64 encoded
}

interface EncryptedStoredFile {
    name: string;
    encryptedData: string;
}

const openDB = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    if (dbInstance) {
      return resolve(dbInstance);
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error("IndexedDB error:", request.error);
      reject(request.error);
    };

    request.onsuccess = () => {
      dbInstance = request.result;
      resolve(dbInstance);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(FILE_STORE)) {
        db.createObjectStore(FILE_STORE, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
      // Handle potential migration from older versions if needed
    };
  });
};

const CHAT_HISTORY_KEY = 'current_chat';

export const dbService = {
  async addDocuments(files: StoredFile[]): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(FILE_STORE, 'readwrite');
    const store = transaction.objectStore(FILE_STORE);
    
    for (const file of files) {
        const encryptedData = await cryptoService.encrypt(file);
        store.put({ name: file.name, encryptedData });
    }

    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getDocuments(): Promise<StoredFile[]> {
    const db = await openDB();
    const transaction = db.transaction(FILE_STORE, 'readonly');
    const store = transaction.objectStore(FILE_STORE);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        const encryptedFiles = request.result as EncryptedStoredFile[];
        const decryptedFiles: StoredFile[] = [];
        for (const file of encryptedFiles) {
            try {
                const decrypted = await cryptoService.decrypt<StoredFile>(file.encryptedData);
                decryptedFiles.push(decrypted);
            } catch (error) {
                console.error(`Could not decrypt file ${file.name}:`, error);
                // Skip corrupted files
            }
        }
        resolve(decryptedFiles);
      };
      request.onerror = () => reject(request.error);
    });
  },

  async removeDocument(fileName: string): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(FILE_STORE, 'readwrite');
    const store = transaction.objectStore(FILE_STORE);
    store.delete(fileName);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  async updateDocument(file: StoredFile): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(FILE_STORE, 'readwrite');
    const store = transaction.objectStore(FILE_STORE);
    const encryptedData = await cryptoService.encrypt(file);
    store.put({ name: file.name, encryptedData });
     return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async saveChatHistory(messages: ChatMessage[]): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAT_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_STORE);
    const encryptedMessages = await cryptoService.encrypt(messages);
    store.put({ id: CHAT_HISTORY_KEY, encryptedMessages });
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getChatHistory(): Promise<ChatMessage[]> {
    const db = await openDB();
    const transaction = db.transaction(CHAT_STORE, 'readonly');
    const store = transaction.objectStore(CHAT_STORE);
    const request = store.get(CHAT_HISTORY_KEY);
    return new Promise((resolve, reject) => {
      request.onsuccess = async () => {
        if (request.result && request.result.encryptedMessages) {
            try {
                const decrypted = await cryptoService.decrypt<ChatMessage[]>(request.result.encryptedMessages);
                resolve(decrypted);
            } catch (error) {
                console.error("Could not decrypt chat history:", error);
                resolve([]); // Return empty history if decryption fails
            }
        } else {
            resolve([]);
        }
      };
      request.onerror = () => reject(request.error);
    });
  },

  async clearChatHistory(): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAT_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_STORE);
    store.delete(CHAT_HISTORY_KEY);
     return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },
  
  async exportData(): Promise<object> {
      const db = await openDB();
      const fileTransaction = db.transaction(FILE_STORE, 'readonly');
      const chatTransaction = db.transaction(CHAT_STORE, 'readonly');
      
      const filesRequest = fileTransaction.objectStore(FILE_STORE).getAll();
      const chatRequest = chatTransaction.objectStore(CHAT_STORE).get(CHAT_HISTORY_KEY);
      
      const [files, chatResult, key] = await Promise.all([
          new Promise((res, rej) => { filesRequest.onsuccess = () => res(filesRequest.result); filesRequest.onerror = () => rej(filesRequest.error); }),
          new Promise((res, rej) => { chatRequest.onsuccess = () => res(chatRequest.result); chatRequest.onerror = () => rej(chatRequest.error); }),
          cryptoService.getExportableKey()
      ]);
      
      if (!key) {
          throw new Error("Could not retrieve encryption key for export.");
      }
      
      return {
          encryptionKey: key,
          files: files,
          chatHistory: chatResult
      };
  },
  
  async importData(data: any): Promise<void> {
      const { encryptionKey, files, chatHistory } = data;
      if (!encryptionKey || !Array.isArray(files)) {
          throw new Error("Invalid import file format.");
      }
      
      // Clear existing key and data
      cryptoService.clearKey();
      await cryptoService.importKey(encryptionKey);
      
      const db = await openDB();
      const clearFileTrans = db.transaction(FILE_STORE, 'readwrite');
      const clearChatTrans = db.transaction(CHAT_STORE, 'readwrite');
      
      const clearFilesPromise = new Promise<void>((res, rej) => {
          const req = clearFileTrans.objectStore(FILE_STORE).clear();
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
      });
      const clearChatPromise = new Promise<void>((res, rej) => {
          const req = clearChatTrans.objectStore(CHAT_STORE).clear();
          req.onsuccess = () => res();
          req.onerror = () => rej(req.error);
      });
      
      await Promise.all([clearFilesPromise, clearChatPromise]);
      
      // Import new data
      const importFileTrans = db.transaction(FILE_STORE, 'readwrite');
      const importChatTrans = db.transaction(CHAT_STORE, 'readwrite');
      const fileStore = importFileTrans.objectStore(FILE_STORE);
      const chatStore = importChatTrans.objectStore(CHAT_STORE);
      
      files.forEach(file => fileStore.put(file));
      if (chatHistory) {
          chatStore.put(chatHistory);
      }
      
       return new Promise((resolve, reject) => {
           let completed = 0;
           const checkCompletion = () => {
               completed++;
               if (completed === 2) resolve();
           };
           importFileTrans.oncomplete = checkCompletion;
           importChatTrans.oncomplete = checkCompletion;
           importFileTrans.onerror = () => reject(importFileTrans.error);
           importChatTrans.onerror = () => reject(importChatTrans.error);
       });
  }
};
