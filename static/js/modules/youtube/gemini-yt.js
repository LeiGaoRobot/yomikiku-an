// Multimodal YouTube wrapper around the shared Gemini client.
//
// Builds the :generateContent request body for YouTube video input
// (fileData + optional videoMetadata.{startOffset, endOffset}) and
// delegates retry / error mapping to gemini/client.js.
//
// Error contract — uniform with the rest of the panels:
//   NO_API_KEY | RATE_LIMITED | EMPTY_RESPONSE | ABORTED | HTTP_<status>: <body>

import { callGemini } from '../gemini/client.js';

export async function callGeminiYoutube(youtubeUrl, prompt, opts = {}) {
  const { startSec, endSec, signal } = opts;

  const filePart = {
    fileData: { fileUri: youtubeUrl, mimeType: 'video/*' },
  };
  if (typeof startSec === 'number' || typeof endSec === 'number') {
    filePart.videoMetadata = {};
    if (typeof startSec === 'number') filePart.videoMetadata.startOffset = `${startSec}s`;
    if (typeof endSec   === 'number') filePart.videoMetadata.endOffset   = `${endSec}s`;
  }

  const body = {
    contents: [{ parts: [filePart, { text: prompt }] }],
    generationConfig: { temperature: 0.4 },
  };

  return callGemini(body, { signal });
}
