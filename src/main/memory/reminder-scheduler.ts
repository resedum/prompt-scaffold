/**
 * 托盘提醒调度（ARCHITECTURE-v2 §4.2 ReminderScheduler）。
 * 定时器回调内 try-catch；提醒本体是本地托盘通知（notify.ts 封装，失败降级不闪退）。
 * 提醒不承诺退出后送达（应用运行时有效）。
 */
import { join } from 'path'
import { JsonCollection, makeId, nowIso } from './fs-utils'
import type { ReminderTask, ReminderInput, RepeatRule } from '../../shared/memory-types'
import { notify } from '../notify'

const TICK_MS = 30000

export class ReminderScheduler {
  private reminders: JsonCollection<ReminderTask>
  private timer: NodeJS.Timeout | null = null

  constructor(public readonly dir: string) {
    this.reminders = new JsonCollection<ReminderTask>(join(dir, 'reminders.json'))
  }

  list(): ReminderTask[] {
    return this.reminders.read().sort((a, b) => a.remindAt.localeCompare(b.remindAt))
  }

  reload(): void {
    this.reminders.clearCache()
  }

  create(input: ReminderInput): ReminderTask {
    const task: ReminderTask = {
      id: makeId(),
      noteId: input.noteId,
      materialId: input.materialId,
      remindAt: input.remindAt,
      repeat: input.repeat ?? 'none',
      status: 'pending',
      channel: 'tray',
      aiSummaryId: input.aiSummaryId
    }
    this.reminders.push(task)
    return task
  }

  dismiss(id: string): boolean {
    return this.reminders.update(id, { status: 'dismissed' }) !== null
  }

  delete(id: string): boolean {
    return this.reminders.remove(id)
  }

  start(): void {
    if (this.timer) return
    this.timer = setInterval(() => {
      try {
        this.tick()
      } catch (err) {
        console.error('[reminder] tick 异常（已捕获）', err)
      }
    }, TICK_MS)
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer)
      this.timer = null
    }
  }

  tick(): void {
    const nowMs = Date.now()
    for (const task of this.reminders.read()) {
      if (task.status !== 'pending') continue
      const due = Date.parse(task.remindAt)
      if (Number.isNaN(due) || due > nowMs) continue
      this.fire(task)
    }
  }

  private fire(task: ReminderTask): void {
    notify('记忆提醒', reminderBody(task))
    if (task.repeat !== 'none') {
      const next = nextRemindAt(task.remindAt, task.repeat)
      if (next) {
        this.reminders.update(task.id, { remindAt: next, status: 'pending' })
        return
      }
    }
    this.reminders.update(task.id, { status: 'fired' })
  }
}

function reminderBody(task: ReminderTask): string {
  if (task.aiSummaryId) return '你有一条关联 AI 总结的提醒'
  if (task.noteId) return '你有一条记事到点提醒'
  if (task.materialId) return '你有一份资料到点提醒'
  return '到点提醒'
}

function nextRemindAt(prevIso: string, repeat: RepeatRule): string | null {
  const base = new Date(prevIso)
  if (Number.isNaN(base.getTime())) return null
  const next = new Date(base)
  if (repeat === 'daily') next.setDate(next.getDate() + 1)
  else if (repeat === 'weekly') next.setDate(next.getDate() + 7)
  else if (repeat === 'monthly') next.setMonth(next.getMonth() + 1)
  else return null
  return next.toISOString()
}
