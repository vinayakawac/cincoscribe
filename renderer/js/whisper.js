/* ===== CincoScribe — Whisper Transcription (Local & API) ===== */
/* Supports both local browser-based transcription and official OpenAI API */
/* NOTE: This is loaded as a REGULAR script (not type=module) so that      */
/* window.WhisperTranscriber is available synchronously to other scripts.   */

(function () {
  'use strict';

  let pipelineFn = null;
  let transcriber = null;
  let loadPromise = null;

  const WhisperTranscriber = {
    isReady: false,
    currentLoadedModel: null,
    models: {
      fast: 'onnx-community/whisper-tiny',
      accuracy: 'onnx-community/whisper-base'
    },

    /**
     * Load the local Whisper model.
     * @param {string} mode - 'fast' or 'accuracy'
     * @param {Function} onProgress - callback for download progress
     */
    async loadModel(mode, onProgress) {
      const targetModel = this.models[mode] || this.models.fast;

      // Already loaded this exact model? Skip.
      if (this.isReady && transcriber && this.currentLoadedModel === targetModel) {
        console.log('[Whisper] Model already loaded:', targetModel);
        return;
      }

      // If another load is in progress, wait for it.
      if (loadPromise) {
        console.log('[Whisper] Waiting for existing load to finish...');
        await loadPromise;
        if (this.currentLoadedModel === targetModel) return;
      }

      console.log('[Whisper] Loading model:', targetModel, 'for mode:', mode);

      loadPromise = (async () => {
        try {
          // Step 1: Load the transformers library if not loaded yet
          if (!pipelineFn) {
            console.log('[Whisper] Importing @huggingface/transformers...');
            const module = await import('https://cdn.jsdelivr.net/npm/@huggingface/transformers@3');
            pipelineFn = module.pipeline;
            console.log('[Whisper] Transformers library loaded.');
          }

          // Step 2: Create the pipeline
          console.log('[Whisper] Creating ASR pipeline for:', targetModel);
          transcriber = await pipelineFn(
            'automatic-speech-recognition',
            targetModel,
            {
              device: 'wasm',
              progress_callback: (data) => {
                if (onProgress) onProgress(data);
              },
            }
          );

          this.currentLoadedModel = targetModel;
          this.isReady = true;
          console.log('[Whisper] Model loaded successfully:', targetModel);
        } catch (err) {
          console.error('[Whisper] Failed to load model:', err);
          this.isReady = false;
          transcriber = null;
          this.currentLoadedModel = null;
          throw new Error('Failed to load Whisper model: ' + err.message);
        }
      })();

      try {
        await loadPromise;
      } finally {
        loadPromise = null;
      }
    },

    /**
     * Transcribe an audio file.
     * Uses OpenAI API if key is configured, otherwise local model.
     */
    async transcribe(audioBlob, language, mode, onProgress) {
      mode = mode || 'fast';

      // Check for OpenAI key
      const apiKey = (typeof AppState !== 'undefined' && AppState.openAiKey)
        ? AppState.openAiKey
        : null;

      if (apiKey) {
        return this._transcribeOpenAI(audioBlob, language, apiKey, onProgress);
      }

      return this._transcribeLocal(audioBlob, language, mode, onProgress);
    },

    /* ── OpenAI API path ──────────────────────────────── */

    async _transcribeOpenAI(audioBlob, language, apiKey, onProgress) {
      // 25MB = 25 * 1024 * 1024
      const MAX_SIZE = 25 * 1024 * 1024;
      if (audioBlob.size <= MAX_SIZE) {
        if (onProgress) onProgress('Uploading audio to OpenAI (file is under 25MB)...', 30);
        return this._sendToOpenAI(audioBlob, language, apiKey);
      }

      if (onProgress) onProgress('File is over 25MB. Decoding audio for chunking...', 10);
      
      // Decode audio
      const audioData = await this._decodeAudio(audioBlob);
      
      // Split into 10 minute chunks (16kHz mono 16-bit PCM for 10 min = ~19MB)
      const SAMPLE_RATE = 16000;
      const SAMPLES_PER_CHUNK = SAMPLE_RATE * 60 * 10;
      
      let fullText = '';
      const allChunks = [];
      let timeOffset = 0;
      
      const totalChunks = Math.ceil(audioData.length / SAMPLES_PER_CHUNK);
      
      for (let i = 0; i < totalChunks; i++) {
        if (onProgress) {
           onProgress(`Uploading chunk ${i+1} of ${totalChunks} to OpenAI...`, 10 + (80 * (i/totalChunks)));
        }
        
        const startIdx = i * SAMPLES_PER_CHUNK;
        const endIdx = Math.min(startIdx + SAMPLES_PER_CHUNK, audioData.length);
        const chunkData = audioData.slice(startIdx, endIdx);
        
        // Convert to WAV Blob
        const wavBlob = Utils.audioBufferToWavBlob(chunkData, SAMPLE_RATE);
        
        // Send to OpenAI
        const result = await this._sendToOpenAI(wavBlob, language, apiKey);
        
        fullText += (fullText ? ' ' : '') + result.text;
        
        if (result.chunks) {
           result.chunks.forEach(seg => {
              const liveSeg = {
                 timestamp: [seg.timestamp[0] + timeOffset, seg.timestamp[1] + timeOffset],
                 text: seg.text
              };
              allChunks.push(liveSeg);
              if (onProgress) onProgress(null, null, liveSeg);
           });
        }
        
        timeOffset += (chunkData.length / SAMPLE_RATE);
      }
      
      if (onProgress) onProgress('Transcription complete! Finalizing...', 95);
      return { text: fullText, chunks: allChunks };
    },

    async _sendToOpenAI(audioBlob, language, apiKey) {
      const formData = new FormData();
      const file = new File([audioBlob], 'audio.mp3', { type: audioBlob.type || 'audio/mp3' });

      formData.append('file', file);
      formData.append('model', 'whisper-1');
      formData.append('response_format', 'verbose_json');
      if (language && language !== 'auto') {
        formData.append('language', language);
      }

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { 'Authorization': 'Bearer ' + apiKey },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error('OpenAI API Error: ' + (errorData.error?.message || response.statusText));
      }

      const result = await response.json();

      const chunks = (result.segments || []).map(seg => ({
        timestamp: [seg.start, seg.end],
        text: seg.text
      }));

      return { text: result.text, chunks: chunks };
    },

    /* ── Local (browser) Whisper path ─────────────────── */

    async _transcribeLocal(audioBlob, language, mode, onProgress) {
      if (!this.isReady || !transcriber) {
        throw new Error(
          'Whisper model is not loaded. This usually means the model download failed or ' +
          'was interrupted. Please refresh the page and try again.'
        );
      }

      console.log('[Whisper] Decoding audio...');
      const audioData = await this._decodeAudio(audioBlob);
      console.log('[Whisper] Audio decoded. Samples:', audioData.length, '(', (audioData.length / 16000).toFixed(1), 'seconds)');

      const opts = {
        return_timestamps: true,
        chunk_length_s: 30,
        stride_length_s: 5,
        task: 'transcribe',
        chunk_callback: (chunk) => {
          if (onProgress) {
            onProgress(null, null, chunk);
          }
        }
      };

      if (language && language !== 'auto') {
        opts.language = this._langCodeToName(language);
      }

      console.log('[Whisper] Starting transcription with opts:', JSON.stringify(opts));
      const rawResult = await transcriber(audioData, opts);
      console.log('[Whisper] Raw result received. Chunks:', rawResult.chunks?.length || 0);

      // Post-process: split chunks by punctuation for fine-grained timestamps
      const chunks = [];
      if (rawResult.chunks && rawResult.chunks.length > 0) {
        for (const phraseObj of rawResult.chunks) {
          const text = (phraseObj.text || '').trim();
          if (!text) continue;

          const start = phraseObj.timestamp[0] || 0;
          const end = phraseObj.timestamp[1] || start + 2;

          // Split on sentence-ending punctuation (. , ! ?) keeping punctuation attached
          const sentences = text.split(/(?<=[.,!?])\s+/).filter(s => s.length > 0);

          if (sentences.length <= 1) {
            chunks.push({ timestamp: [start, end], text: text });
          } else {
            // Interpolate timestamps proportionally by character count
            const totalChars = sentences.reduce((sum, s) => sum + s.length, 0);
            const duration = end - start;
            let t = start;

            for (const sentence of sentences) {
              const ratio = sentence.length / totalChars;
              const dur = duration * ratio;
              chunks.push({ timestamp: [t, t + dur], text: sentence });
              t += dur;
            }
          }
        }
      } else if (rawResult.text) {
        chunks.push({ timestamp: [0, 0], text: rawResult.text });
      }

      return { text: rawResult.text, chunks: chunks };
    },

    /* ── Helpers ───────────────────────────────────────── */

    async _decodeAudio(blob) {
      const arrayBuffer = await blob.arrayBuffer();
      const audioCtx = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      });

      const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);
      const channelData = audioBuffer.getChannelData(0);
      audioCtx.close();

      return channelData;
    },

    _langCodeToName(code) {
      var map = {
        en: 'english', hi: 'hindi', ar: 'arabic', zh: 'chinese',
        es: 'spanish', fr: 'french', de: 'german', pt: 'portuguese',
        ru: 'russian', ja: 'japanese', ko: 'korean', it: 'italian',
        tr: 'turkish', ur: 'urdu', bn: 'bengali', pa: 'punjabi',
        id: 'indonesian', ms: 'malay', nl: 'dutch', pl: 'polish',
        sv: 'swedish', fa: 'persian', vi: 'vietnamese', th: 'thai',
      };
      return map[code] || code;
    },
  };

  // Expose globally — synchronously available to all other scripts
  window.WhisperTranscriber = WhisperTranscriber;
  console.log('[Whisper] WhisperTranscriber registered on window.');
})();
