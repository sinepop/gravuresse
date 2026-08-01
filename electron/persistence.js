const fs = require('fs')

let tempSequence = 0

function persistenceError(code, message, filePath, cause) {
  const error = new Error(message)
  error.code = code
  error.path = filePath
  error.cause = cause
  return error
}

function writeJsonAtomic(filePath, payload, { errorCode, label }) {
  const tmpFile = `${filePath}.tmp-${process.pid}-${++tempSequence}`
  try {
    const json = JSON.stringify(payload, null, 2)
    fs.writeFileSync(tmpFile, json, { encoding: 'utf8', flush: true })
    fs.renameSync(tmpFile, filePath)
  } catch (cause) {
    try {
      fs.unlinkSync(tmpFile)
    } catch {}
    throw persistenceError(
      errorCode,
      `Failed to save ${label}; the previous file was left unchanged`,
      filePath,
      cause
    )
  }
}

module.exports = { persistenceError, writeJsonAtomic }
