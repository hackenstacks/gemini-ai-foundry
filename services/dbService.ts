import { ChatMessage } from '../types';

const DB_NAME = 'GeminiAIStudioDB';
const DB_VERSION = 1;
const DOC_STORE = 'documents';
const CHAT_STORE = 'chatHistory';

let dbInstance: IDBDatabase | null = null;

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
      if (!db.objectStoreNames.contains(DOC_STORE)) {
        db.createObjectStore(DOC_STORE, { keyPath: 'name' });
      }
      if (!db.objectStoreNames.contains(CHAT_STORE)) {
        db.createObjectStore(CHAT_STORE, { keyPath: 'id' });
      }
    };
  });
};

const CHAT_HISTORY_KEY = 'current_chat';

export const dbService = {
  async addDocument(file: File): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    store.put(file);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async getDocuments(): Promise<File[]> {
    const db = await openDB();
    const transaction = db.transaction(DOC_STORE, 'readonly');
    const store = transaction.objectStore(DOC_STORE);
    const request = store.getAll();
    return new Promise((resolve, reject) => {
      request.onsuccess = () => resolve(request.result as File[]);
      request.onerror = () => reject(request.error);
    });
  },

  async removeDocument(fileName: string): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(DOC_STORE, 'readwrite');
    const store = transaction.objectStore(DOC_STORE);
    store.delete(fileName);
    return new Promise((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });
  },

  async saveChatHistory(messages: ChatMessage[]): Promise<void> {
    const db = await openDB();
    const transaction = db.transaction(CHAT_STORE, 'readwrite');
    const store = transaction.objectStore(CHAT_STORE);
    store.put({ id: CHAT_HISTORY_KEY, messages });
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
      request.onsuccess = () => {
        resolve(request.result ? request.result.messages : []);
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
  }
};