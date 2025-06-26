import path from 'node:path'
import process from 'node:process'
import ansis from 'ansis'
import winston from 'winston'
import DailyRotateFile from 'winston-daily-rotate-file'

interface CustomTransformableInfo extends winston.Logform.TransformableInfo {
  metadata?: {
    fileOnly?: boolean
    [key: string]: any
  }
}

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
function formatConsole(info: CustomTransformableInfo) {
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

// 创建自定义过滤格式
const fileOnlyFilter = winston.format((info: CustomTransformableInfo) => {
  // 如果是文件专用日志，则跳过控制台输出
  return info.metadata?.fileOnly ? false : info
})

// 文件日志格式化函数
function formatFile(info: CustomTransformableInfo) {
  const { timestamp, level, metadata } = info

  const message
    = typeof info.message === 'string' ? info.message : String(info.message)

  // 处理多行消息（每行单独缩进）
  const formattedMessage = message.includes('\n')
    ? `\n  ${message.replace(/\n/g, '\n  ')}`
    : message

  // 格式化元数据（如果有）
  const metaStr
    = metadata && Object.keys(metadata).length > 0
      ? `\n  ${JSON.stringify(metadata, null, 2).replace(/\n/g, '\n  ')}`
      : ''

  // 确保级别名称长度一致
  const paddedLevel = level.toUpperCase().padEnd(7)

  return `[${timestamp}] [${paddedLevel}] ${formattedMessage}${metaStr}`
}

// 创建 winston 日志实例
const logger = winston.createLogger({
  levels,
  format: winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.metadata({
      fillExcept: ['message', 'level', 'timestamp', 'label'],
    }),
  ),
  transports: [
    // 控制台输出，带颜色
    new winston.transports.Console({
      level: 'success',
      format: winston.format.combine(
        fileOnlyFilter(), // 应用自定义过滤
        winston.format.printf(formatConsole),
      ),
    }),
    // 普通日志文件，按天轮转，保留14天，自动压缩归档
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'git-ritual-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '1d',
      level: 'success',
      format: winston.format.combine(
        winston.format.uncolorize(),
        winston.format.printf(formatFile), // 使用自定义文本格式
      ),
    }),
    // 错误日志文件，按天轮转，保留30天，自动压缩归档
    new DailyRotateFile({
      filename: path.join(process.cwd(), 'git-ritual-error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      zippedArchive: true,
      maxFiles: '1d',
      level: 'warn',
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

/**
 * 只写入日志文件，不输出到终端
 */
function logToFileOnly(message: string, level: LogLevel = 'info') {
  logger.log(level, message, { fileOnly: true })
}

export { logger, logMessage, logToFileOnly }
