import { useState, useCallback, useRef, useEffect } from 'react';

/**
 * 深拷贝工具函数
 */
function deepClone<T>(obj: T): T {
  if (typeof structuredClone !== 'undefined') {
    return structuredClone(obj);
  }
  // 降级方案：使用 JSON 序列化（不支持函数、undefined、Symbol等）
  return JSON.parse(JSON.stringify(obj));
}

/**
 * 通用的撤销/重做 Hook
 * @param initialState 初始状态（可选，如果不提供则历史记录为空，直到第一次 pushState）
 * @param maxHistorySize 最大历史记录数量，默认50
 */
export function useUndoRedo<T>(initialState?: T, maxHistorySize: number = 50) {
  // 如果提供了初始状态，则初始化历史记录；否则为空数组
  const [history, setHistory] = useState<T[]>(initialState !== undefined ? [deepClone(initialState)] : []);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const isUndoRedoRef = useRef<boolean>(false); // 标记是否正在执行undo/redo，避免循环记录
  const currentIndexRef = useRef<number>(0); // 使用ref存储当前索引，确保同步

  // 当前状态（如果历史记录为空，返回 undefined）
  const currentState = history.length > 0 ? history[currentIndex] : undefined;

  // 是否可以撤销
  const canUndo = currentIndex > 0;

  // 是否可以重做
  const canRedo = currentIndex < history.length - 1;

  // 同步ref和state
  useEffect(() => {
    currentIndexRef.current = currentIndex;
  }, [currentIndex]);

  // 添加新状态到历史记录
  const pushState = useCallback((state: T) => {
    if (isUndoRedoRef.current) {
      // 如果正在执行undo/redo，不记录新状态
      return;
    }

    // 深拷贝状态，避免引用复用
    const clonedState = deepClone(state);

    setHistory(prev => {
      const currentIdx = currentIndexRef.current;
      // 如果当前不在历史记录的末尾，删除后面的记录（分支）
      const newHistory = prev.slice(0, currentIdx + 1);
      
      // 添加新状态（已深拷贝）
      newHistory.push(clonedState);
      
      // 限制历史记录数量
      if (newHistory.length > maxHistorySize) {
        newHistory.shift(); // 移除最旧的状态
      }
      
      // 一次性计算新索引
      const newIndex = newHistory.length - 1;
      
      // 同步更新 state 和 ref
      setCurrentIndex(newIndex);
      currentIndexRef.current = newIndex;
      
      return newHistory;
    });
  }, [maxHistorySize]);

  // 撤销
  const undo = useCallback(() => {
    if (!canUndo) return;

    isUndoRedoRef.current = true;
    setCurrentIndex(prev => {
      const newIndex = Math.max(0, prev - 1);
      currentIndexRef.current = newIndex; // Update ref immediately
      return newIndex;
    });
    
    // 使用 setTimeout 确保状态更新完成后再重置标志
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50); // 增加延迟确保状态更新完成
  }, [canUndo]);

  // 重做
  const redo = useCallback(() => {
    if (!canRedo) return;

    isUndoRedoRef.current = true;
    setCurrentIndex(prev => {
      const newIndex = Math.min(history.length - 1, prev + 1);
      currentIndexRef.current = newIndex; // Update ref immediately
      return newIndex;
    });
    
    // 使用 setTimeout 确保状态更新完成后再重置标志
    setTimeout(() => {
      isUndoRedoRef.current = false;
    }, 50); // 增加延迟确保状态更新完成
  }, [canRedo, history.length]);

  // 重置历史记录（静默重置，不触发状态更新）
  const reset = useCallback((newInitialState?: T) => {
    if (newInitialState !== undefined) {
      const clonedState = deepClone(newInitialState);
      setHistory([clonedState]);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
    } else {
      // 如果未提供初始状态，清空历史记录
      setHistory([]);
      setCurrentIndex(0);
      currentIndexRef.current = 0;
    }
    isUndoRedoRef.current = false;
  }, []);

  // 键盘快捷键支持
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl+Z 或 Cmd+Z (Mac)
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      }
      // Ctrl+Y 或 Ctrl+Shift+Z 或 Cmd+Shift+Z (Mac)
      else if (
        ((e.ctrlKey || e.metaKey) && e.key === 'y') ||
        ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'z')
      ) {
        e.preventDefault();
        redo();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [undo, redo]);

  return {
    currentState,
    pushState,
    undo,
    redo,
    canUndo,
    canRedo,
    reset,
  };
}

