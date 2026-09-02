import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createApp } from './index.js'

test('GET /hello sends a hello message to OpenAI and returns the reply', async () => {
  let sentInput: string | undefined

  const app = createApp({
    responses: {
      create: async (body) => {
        sentInput = body.input
        return { output_text: 'Hello from the model' }
      },
    },
  })

  const res = await app.request('/hello')

  assert.equal(res.status, 200)
  assert.equal(sentInput, 'hello')
  assert.equal(await res.text(), 'Hello from the model')
})
