// 章节状态管理 hook

import { useState, useEffect } from 'react';

// 类型定义
interface NovelChapter {
  id: string;
  chapterNumber: number;
  title: string;
  content: string;
  createdAt: number;
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

async function saveChapter(outlineId: string, chapter: NovelChapter): Promise<void> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chapters'], 'readwrite');
    const store = tx.objectStore('chapters');
    const request = store.put({ ...chapter, outlineId });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

async function loadChaptersForOutline(outlineId: string): Promise<NovelChapter[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(['chapters'], 'readonly');
    const store = tx.objectStore('chapters');
    const index = store.index('outlineId');
    const request = index.getAll(outlineId);
    request.onsuccess = () => {
      const chapters = request.result || [];
      chapters.sort((a, b) => a.chapterNumber - b.chapterNumber);
      resolve(chapters);
    };
    request.onerror = () => reject(request.error);
  });
}

export function useChapters(outlineId?: string) {
  const [chapters, setChapters] = useState<NovelChapter[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (outlineId) {
      loadChapters(outlineId);
    }
  }, [outlineId]);

  const loadChapters = async (id: string) => {
    setIsLoading(true);
    try {
      const data = await loadChaptersForOutline(id);
      setChapters(data);
    } finally {
      setIsLoading(false);
    }
  };

  const saveChapterData = async (chapter: NovelChapter) => {
    if (!outlineId) return;

    await saveChapter(outlineId, chapter);
    await loadChapters(outlineId);
  };

  const getChapter = (chapterNumber: number) => {
    return chapters.find(c => c.chapterNumber === chapterNumber);
  };

  const getPreviousChaptersSummary = (currentChapterNumber: number) => {
    const previousChapters = chapters.filter(c => c.chapterNumber < currentChapterNumber);
    if (previousChapters.length === 0) return '';

    return previousChapters
      .map(c => `第${c.chapterNumber}章: ${c.title}\n${c.content.slice(0, 200)}...`)
      .join('\n\n');
  };

  return {
    chapters,
    isLoading,
    saveChapterData,
    getChapter,
    getPreviousChaptersSummary,
    refresh: () => outlineId && loadChapters(outlineId),
  };
}
