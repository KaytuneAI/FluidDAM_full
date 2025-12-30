import { useState, useReducer, useRef, useCallback } from 'react';

export type UndoRedoAction = 'push' | 'undo' | 'redo' | 'reset' | null;

export interface UseUndoRedoReturn<T> {
  currentState: T | null;
  canUndo: boolean;
  canRedo: boolean;
  lastAction: UndoRedoAction;
  pushState: (state: T) => void;
  undo: () => void;
  redo: () => void;
  reset: () => void;
  clear: () => void;
}

/**
 * Undo/Redo Hook with lastAction tracking
 * 
 * Returns lastAction to distinguish between:
 * - 'push': User action that adds new state
 * - 'undo': User triggered undo
 * - 'redo': User triggered redo
 * - 'reset': State was reset
 * - null: Initial state or after clear
 */
type UndoRedoState<T> = {
  history: T[];
  currentIndex: number;
  lastAction: UndoRedoAction;
};

type UndoRedoActionType<T> =
  | { type: 'PUSH'; state: T }
  | { type: 'UNDO' }
  | { type: 'REDO' }
  | { type: 'RESET' }
  | { type: 'CLEAR' };

function undoRedoReducer<T>(state: UndoRedoState<T>, action: UndoRedoActionType<T>): UndoRedoState<T> {
  switch (action.type) {
    case 'PUSH': {
      const newHistory = state.history.slice(0, state.currentIndex + 1);
      newHistory.push(action.state);
      console.log('[UndoRedo] reducer PUSH:', {
        prevLength: state.history.length,
        currentIndex: state.currentIndex,
        newLength: newHistory.length,
        newIndex: state.currentIndex + 1,
      });
      return {
        history: newHistory,
        currentIndex: state.currentIndex + 1,
        lastAction: 'push',
      };
    }
    case 'UNDO': {
      if (state.history.length > 0 && state.currentIndex > 0) {
        const newIndex = state.currentIndex - 1;
        console.log('[UndoRedo] reducer UNDO:', {
          currentIndex: state.currentIndex,
          newIndex,
          historyLength: state.history.length,
          hasState: !!state.history[newIndex],
        });
        return {
          ...state,
          currentIndex: newIndex,
          lastAction: 'undo',
        };
      }
      return state;
    }
    case 'REDO': {
      if (state.currentIndex < state.history.length - 1) {
        const newIndex = state.currentIndex + 1;
        console.log('[UndoRedo] reducer REDO:', {
          currentIndex: state.currentIndex,
          newIndex,
          historyLength: state.history.length,
          hasState: !!state.history[newIndex],
        });
        return {
          ...state,
          currentIndex: newIndex,
          lastAction: 'redo',
        };
      }
      return state;
    }
    case 'RESET': {
      console.log('[UndoRedo] reducer RESET');
      return {
        ...state,
        currentIndex: 0,
        lastAction: 'reset',
      };
    }
    case 'CLEAR': {
      console.log('[UndoRedo] reducer CLEAR');
      return {
        history: [],
        currentIndex: -1,
        lastAction: null,
      };
    }
    default:
      return state;
  }
}

export function useUndoRedo<T>(initialState?: T): UseUndoRedoReturn<T> {
  const [state, dispatch] = useReducer(undoRedoReducer<T>, {
    history: initialState ? [initialState] : [],
    currentIndex: initialState ? 0 : -1,
    lastAction: null,
  });
  
  const { history, currentIndex, lastAction } = state;

  // canUndo: 必须至少有一个初始状态（index 0），且当前不在初始状态
  const canUndo = history.length > 0 && currentIndex > 0;
  const canRedo = currentIndex < history.length - 1;
  const currentState = currentIndex >= 0 && currentIndex < history.length ? history[currentIndex] : null;
  
  // Debug: 输出当前状态
  if (currentState === null && currentIndex >= 0) {
    console.error('[UndoRedo] currentState is null but currentIndex is valid:', {
      currentIndex,
      historyLength: history.length,
      historyIndices: history.map((_, i) => i),
      historyStates: history.map((s, i) => ({ index: i, hasState: !!s, stateType: s ? typeof s : 'null' })),
    });
  }

  const pushState = useCallback((newState: T) => {
    console.log('[UndoRedo] pushState called:', {
      currentIndex,
      historyLength: history.length,
      hasState: !!newState,
    });
    dispatch({ type: 'PUSH', state: newState });
  }, [currentIndex, history.length]);

  const undo = useCallback(() => {
    console.log('[UndoRedo] undo called:', { 
      canUndo, 
      currentIndex, 
      historyLength: history.length,
      historyIndices: history.map((_, i) => i),
      currentStateAtCurrentIndex: history[currentIndex],
    });
    if (canUndo) {
      dispatch({ type: 'UNDO' });
    } else {
      console.warn('[UndoRedo] undo failed: cannot undo', { canUndo, currentIndex, historyLength: history.length });
    }
  }, [canUndo, currentIndex, history]);

  const redo = useCallback(() => {
    console.log('[UndoRedo] redo called:', { canRedo, currentIndex, historyLength: history.length });
    if (canRedo) {
      dispatch({ type: 'REDO' });
    } else {
      console.warn('[UndoRedo] redo failed: cannot redo', { canRedo, currentIndex, historyLength: history.length });
    }
  }, [canRedo, currentIndex, history.length]);

  const reset = useCallback(() => {
    console.log('[UndoRedo] reset called:', { currentIndex, historyLength: history.length });
    dispatch({ type: 'RESET' });
  }, [currentIndex, history.length]);

  const clear = useCallback(() => {
    console.log('[UndoRedo] clear called:', { currentIndex, historyLength: history.length });
    dispatch({ type: 'CLEAR' });
  }, [currentIndex, history.length]);

  return {
    currentState,
    canUndo,
    canRedo,
    lastAction,
    pushState,
    undo,
    redo,
    reset,
    clear,
  };
}
