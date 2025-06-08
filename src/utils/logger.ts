import ansis from 'ansis'

export const logger = {
  info: (message: string) => console.log(ansis.blue(message)),
  success: (message: string) => console.log(ansis.green(message)),
  warn: (message: string) => console.log(ansis.yellow(message)),
  error: (message: string) => console.error(ansis.red(message)),
  log: (message: string) => console.log(message),
}
