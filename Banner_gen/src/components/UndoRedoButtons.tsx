import React from 'react';
import './UndoRedoButtons.css';

interface UndoRedoButtonsProps {
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

export const UndoRedoButtons: React.FC<UndoRedoButtonsProps> = ({
  onUndo,
  onRedo,
  canUndo,
  canRedo,
}) => {
  return (
    <div className="undo-redo-buttons">
      <button
        className="undo-redo-button undo-button"
        onClick={onUndo}
        disabled={!canUndo}
        title="撤销 (Ctrl+Z)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M2 8C2 10.2091 3.79086 12 6 12H12M2 8L4 6M2 8L4 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>撤销</span>
      </button>
      <button
        className="undo-redo-button redo-button"
        onClick={onRedo}
        disabled={!canRedo}
        title="重做 (Ctrl+Y / Ctrl+Shift+Z)"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M14 8C14 10.2091 12.2091 12 10 12H4M14 8L12 6M14 8L12 10"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        <span>重做</span>
      </button>
    </div>
  );
};






