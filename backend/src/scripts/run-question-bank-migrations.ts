import { migrateQuestionBankSchema } from '../question-bank-db-service'

async function main() {
  const result = await migrateQuestionBankSchema()
  console.log(JSON.stringify({ message: 'success', ...result }, null, 2))
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exit(1)
})
