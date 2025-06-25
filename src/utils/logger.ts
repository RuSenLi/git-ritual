import path from 'node:path'
import process from 'node:process'
import ansis from 'ansis'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

// 日志级别与颜色的映射，控制台彩色输出
const levelColors = {
  error: 'red',
  warn: 'yellow',
  info: 'blue',
  http: 'magenta',
  verbose: 'cyan',
  debug: 'white',
  silly: 'gray',
  success: 'green',
} as const

// 日志级别与数值的映射，数值越小优先级越高
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  verbose: 4,
  debug: 5,
  silly: 6,
  success: 7,
} as const

// 日志级别类型
type LogLevel = keyof typeof levels
// 日志颜色类型
type SimpleColorName = (typeof levelColors)[LogLevel]
type CustomLogger = winston.Logger & {
  success: winston.LeveledLogMethod
}

// 控制台日志格式化函数，带颜色
function formatConsole(info: winston.Logform.TransformableInfo) {
  // 获取对应级别的颜色，默认为 white
  const colorName: SimpleColorName
    = levelColors[info.level as LogLevel] || 'white'
  const colorizer = ansis[colorName]
  // 如果有堆栈信息则输出堆栈，否则只输出消息
  const message = info.stack
    ? `${info.message}\n${info.stack}`
    : `${info.message}`
  return colorizer(message).toString()
}

// 创建 winston 日志实例
const logger = winston.createLogger({
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
  ),
  transports: [
    // 控制台输出，带颜色
    new winston.transports.Console({
      level: 'success',
      format: winston.format.printf(formatConsole),
    }),
    // 普通日志文件，按天轮转，保留14天，自动压缩归档
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'git-ritual-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '14d',
      level: 'debug',
      format: winston.format.combine(
        winston.format.uncolorize(), // 移除颜色
        winston.format.json(), // JSON 格式
      ),
    }),
    // 错误日志文件，按天轮转，保留30天，自动压缩归档
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'git-ritual-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '30d',
      level: 'error',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.json(),
      ),
    }),
  ],
}) as CustomLogger

// 自定义日志方法，避免直接覆盖 winston 的 log 方法
function logMessage(message: string, level: LogLevel = 'info') {
  logger.log({ level, message })
}

// 只写入文件 transport，不输出到控制台
function logToFileOnly(message: string, level: LogLevel = 'info') {
  logger.transports
    ?.filter((t): t is DailyRotateFile => t instanceof DailyRotateFile)
    .forEach(t => t?.log?.({ level, message }, () => {}))
}

export { logger, logMessage, logToFileOnly }
