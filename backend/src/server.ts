import { PORT } from './config'
import { createApp } from './app'

const app = createApp()

app.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`Server running on http://127.0.0.1:${PORT}`)
})
