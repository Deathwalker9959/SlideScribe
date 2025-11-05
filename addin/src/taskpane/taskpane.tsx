/*
 * Copyright (c) Microsoft Corporation. All rights reserved. Licensed under the MIT license.
 * See LICENSE in the project root for license information.
 */

import { createRoot } from 'react-dom/client';
import { NarrationAssistant } from '@components/NarrationAssistant';

/* global document, Office */

Office.onReady((info) => {
  if (info.host === Office.HostType.PowerPoint) {
    const sideloadMsg = document.getElementById("sideload-msg");
    if (sideloadMsg) {
      sideloadMsg.style.display = "none";
    }
    const appBody = document.getElementById("app-body");
    if (appBody) {
      appBody.style.display = "block";
    }
    
    // Mount React component
    const reactRoot = document.getElementById("react-root");
    const fallbackContent = document.getElementById("fallback-content");
    
    try {
      if (reactRoot) {
        // Hide fallback content
        if (fallbackContent) {
          fallbackContent.style.display = "none";
        }
        
        const root = createRoot(reactRoot);
        root.render(<NarrationAssistant />);
      } else {
        throw new Error("React root element not found");
      }
    } catch (error) {
      console.error("Error loading React components:", error);
      // Show fallback content on error
      if (fallbackContent) {
        fallbackContent.style.display = "block";
      }
      if (reactRoot) {
        reactRoot.style.display = "none";
      }
    }
  }
});

export async function run() {
  /**
   * Insert your PowerPoint code here
   */
  const options: Office.SetSelectedDataOptions = { coercionType: Office.CoercionType.Text };

  await Office.context.document.setSelectedDataAsync(" ", options);
  await Office.context.document.setSelectedDataAsync("Hello World!", options);
}
