"use client";

import { usePublishBarInternal } from "./PublishBarContext";
import "./publish-bar.css";

function SpinnerIcon() {
  return (
    <svg className="publish-spinner" width="16" height="16" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" strokeDasharray="28" strokeDashoffset="8" strokeLinecap="round" />
    </svg>
  );
}

export function PublishBar() {
  const {
    undoStack,
    redoStack,
    isUndoing,
    isPublishing,
    hasUnsavedChanges,
    handleUndo,
    handleRedo,
    handlePublish,
  } = usePublishBarInternal();

  return (
    <div className={`publish-actions ${hasUnsavedChanges ? "publish-actions--visible" : ""}`}>
      <div className="publish-actions-left">
        <button
          type="button"
          className="publish-action-icon"
          onClick={handleUndo}
          disabled={undoStack.length === 0 || isUndoing}
          aria-label="Undo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
            <path d="M232,184a8,8,0,0,1-16,0A88,88,0,0,0,65.78,121.78L43.4,144H88a8,8,0,0,1,0,16H24a8,8,0,0,1-8-8V88a8,8,0,0,1,16,0v44.77l22.48-22.33A104,104,0,0,1,232,184Z" />
          </svg>
        </button>
        <button
          type="button"
          className="publish-action-icon"
          onClick={handleRedo}
          disabled={redoStack.length === 0 || isUndoing}
          aria-label="Redo"
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" fill="currentColor" viewBox="0 0 256 256">
            <path d="M240,88v64a8,8,0,0,1-8,8H168a8,8,0,0,1,0-16h44.6l-22.36-22.21A88,88,0,0,0,40,184a8,8,0,0,1-16,0,104,104,0,0,1,177.54-73.54L224,132.77V88a8,8,0,0,1,16,0Z" />
          </svg>
        </button>
      </div>
      <button
        type="button"
        className="publish-btn"
        onClick={handlePublish}
        disabled={isPublishing}
      >
        {isPublishing && <SpinnerIcon />}
        <span>Spara</span>
      </button>
    </div>
  );
}
