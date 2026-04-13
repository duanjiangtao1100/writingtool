// 大纲状态管理 hook

import { useState, useEffect } from 'react';

// 类型定义
interface OutlineItem {
  id: string;
  chapterNumber: number;
  title: string;
  description: string;
}

interface NovelOutline {
  id: string;
  title: string;
  chapters: OutlineItem[];
  coreSummary: string;
  createdAt: number;
  updatedAt: number;
}

// IndexedDB 操作
async function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('writingtool-db', 1);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;

      if (!db.objectStoreNames.contains('outlines')) {
        const store = db.createObjectStore('outlines', { keyPath: 'id' });
        store.createIndex('createdAt', 'createdAt', { unique: false });
      }

      if (!db.objectStoreNames.contains('chapters')) {
        const store = db.createObjectStore('chapters', { keyPath: 'id' });
        store.createIndex('outlineId', 'outlineId', { unique: false });
        store.createIndex('chapterNumber', 'chapterNumber', { unique: false });
      }
    };
  });
}

async function saveOutline(outline: NovelOutline): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['outlines'], 'readwrite');
    const store = tx.objectStore('outlines');
    const request = store.put(outline);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadOutline(id: string): Promise<NovelOutline | null> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['outlines'], 'readonly');
    const store = tx.objectStore('outlines');
    const request = store.get(id);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

async function loadAllOutlines(): Promise<NovelOutline[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['outlines'], 'readonly');
    const store = tx.objectStore('outlines');
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export function useOutline(outlineId?: string) {
  const [outline, setOutline] = useState<NovelOutline | null>(null);
  const [allOutlines, setAllOutlines] = useState<NovelOutline[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (outlineId) {
      loadOutlineData(outlineId);
    }
    loadAllOutlinesData();
  }, [outlineId]);

  const loadOutlineData = async (id: string) => {
    setIsLoading(true);
    try {
      const data = await loadOutline(id);
      setOutline(data);
    } finally {
      setIsLoading(false);
    }
  };

  const loadAllOutlinesData = async () => {
    try {
      const data = await loadAllOutlines();
      setAllOutlines(data);
    } catch (err) {
      console.error('Failed to load outlines:', err);
    }
  };

  const saveOutlineData = async (updatedOutline: NovelOutline) => {
    await saveOutline(updatedOutline);
    setOutline(updatedOutline);
    await loadAllOutlinesData();
  };

  const updateChapter = (chapterIndex: number, updates: Partial<OutlineItem>) => {
    if (!outline) return;

    const updatedChapters = [...outline.chapters];
    updatedChapters[chapterIndex] = {
      ...updatedChapters[chapterIndex],
      ...updates,
    };

    const updatedOutline = {
      ...outline,
      chapters: updatedChapters,
      updatedAt: Date.now(),
    };

    setOutline(updatedOutline);
  };

  return {
    outline,
    allOutlines,
    isLoading,
    setOutline,
    saveOutlineData,
    updateChapter,
    refresh: loadAllOutlinesData,
  };
}
