import { spawn } from 'node:child_process'
import { mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { Hono } from 'hono'
import OpenAI from 'openai'

export type HelloClient = {
  responses: {
    create: (body: { model: string; input: string }) => Promise<{ output_text: string }>
  }
  convertVideoToAudio?: (file: File) => Promise<File>
  transcribeAudio?: (file: File) => Promise<{ text: string }>
  saveTranscript?: (text: string) => Promise<string>
}

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args)
    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with ${code}`))
    })
  })
}

async function convertVideoToAudio(file: File) {
  const dir = await mkdtemp(path.join(tmpdir(), 'transcribe-'))
  const inputPath = path.join(dir, file.name || 'input.mp4')
  const outputPath = path.join(dir, 'audio.mp3')
  await writeFile(inputPath, Buffer.from(await file.arrayBuffer()))
  await run('ffmpeg', ['-y', '-i', inputPath, '-vn', '-acodec', 'libmp3lame', '-q:a', '4', outputPath])
  const audio = await readFile(outputPath)
  return new File([audio], 'audio.mp3', { type: 'audio/mpeg' })
}

async function transcribeAudio(file: File) {
  const transcription = await new OpenAI().audio.transcriptions.create({
    file,
    model: 'gpt-4o-transcribe',
  })
  return { text: transcription.text }
}

async function saveTranscript(text: string) {
  const dir = path.join(process.cwd(), 'transcripts')
  await mkdir(dir, { recursive: true })
  const savedPath = path.join(dir, `${Date.now()}.json`)
  await writeFile(savedPath, JSON.stringify({ text }, null, 2))
  return savedPath
}

export function createApp(client: HelloClient) {
  const app = new Hono()

  const welcomeStrings = [
    'Hello Hono!',
    'To learn more about Hono on Vercel, visit https://vercel.com/docs/frameworks/backend/hono'
  ]

  app.get('/', (c) => {
    return c.text(welcomeStrings.join('\n\n'))
  })

  app.get('/hello', async (c) => {
    const response = await client.responses.create({
      model: 'gpt-4o-mini',
      input: 'hello',
    })

    return c.text(response.output_text)
  })

  app.post('/transcribe', async (c) => {
    const body = await c.req.parseBody()
    const file = body['file']
    if (!(file instanceof File)) {
      return c.json({ error: 'file is required' }, 400)
    }

    const audio = await (client.convertVideoToAudio ?? convertVideoToAudio)(file)
    const result = await (client.transcribeAudio ?? transcribeAudio)(audio)
    const savedPath = await (client.saveTranscript ?? saveTranscript)(result.text)
    return c.json({ text: result.text, savedPath })
  })

  return app
}

export default createApp({
  responses: {
    create: async (body) => {
      const response = await new OpenAI().responses.create(body)
      return { output_text: response.output_text }
    },
  },
})
