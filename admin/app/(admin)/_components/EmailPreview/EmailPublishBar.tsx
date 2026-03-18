"use client";

import { useEmailBrandingInternal } from "./EmailBrandingContext";
import { PublishBarUI } from "../PublishBar/PublishBar";

export function EmailPublishBar() {
  const {
    isPublishing,
    isDiscarding,
    isLingeringAfterPublish,
    hasUnsavedChanges,
    publishError,
    handlePublish,
    handleDiscard,
  } = useEmailBrandingInternal();

  return (
    <PublishBarUI
      hasUnsavedChanges={hasUnsavedChanges}
      isPublishing={isPublishing}
      isDiscarding={isDiscarding}
      isLingeringAfterPublish={isLingeringAfterPublish}
      onPublish={handlePublish}
      onDiscard={handleDiscard}
      error={publishError}
    />
  );
}
