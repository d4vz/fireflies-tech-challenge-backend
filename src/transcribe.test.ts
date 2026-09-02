import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from './index.js'

test('POST /transcribe converts the uploaded video, transcribes it, and saves the result', async () => {
  const uploaded = new File(['video-bytes'], 'clip.mp4', { type: 'video/mp4' })
  let convertedFile: File | undefined
  let transcribedFile: File | undefined
  let savedText: string | undefined

  const app = createApp({
    responses: {
      create: async () => ({ output_text: '' }),
    },
    convertVideoToAudio: async (file) => {
      convertedFile = file
      return new File(['audio-bytes'], 'clip.mp3', { type: 'audio/mpeg' })
    },
    transcribeAudio: async (file) => {
      transcribedFile = file
      return { text: 'hello from the recording' }
    },
    saveTranscript: async (text) => {
      savedText = text
      return 'transcripts/clip.json'
    },
  })

  const form = new FormData()
  form.set('file', uploaded)

  const res = await app.request('/transcribe', {
    method: 'POST',
    body: form,
  })

  assert.equal(res.status, 200)
  assert.equal(convertedFile?.name, 'clip.mp4')
  assert.equal(transcribedFile?.name, 'clip.mp3')
  assert.equal(savedText, 'hello from the recording')
  assert.deepEqual(await res.json(), {
    text: 'hello from the recording',
    savedPath: 'transcripts/clip.json',
  })
})
