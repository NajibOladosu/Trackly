/**
 * AI Retry Queue Service
 *
 * Manages retrying of AI tasks when rate limits are encountered.
 * Persists retry tasks to database for reliable recovery.
 */

import { createClient } from '@supabase/supabase-js'

type TaskType = 'parse_document' | 'generate_report' | 'generate_answer' | 'extract_questions' | 'generate_cover_letter'

interface RetryTask {
  id?: string
  userId: string
  taskType: TaskType
  taskData: Record<string, unknown>
  scheduledRetryTime: Date
  attemptCount?: number
  maxAttempts?: number
  lastError?: string
}

export class RetryQueueService {
  private static supabase = (() => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
    if (!serviceRoleKey) {
      throw new Error('SUPABASE_SERVICE_ROLE_KEY is required for RetryQueueService. Falling back to anon key would bypass RLS and is not allowed.')
    }
    return createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      serviceRoleKey,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    )
  })()

  /**
   * Queue a task for retry when rate limit expires
   */
  static async queueTask(task: RetryTask): Promise<string | null> {
    try {
      const { data, error } = await this.supabase
        .from('ai_retry_queue')
        .insert({
          user_id: task.userId,
          task_type: task.taskType,
          task_data: task.taskData,
          scheduled_retry_time: task.scheduledRetryTime.toISOString(),
          attempt_count: task.attemptCount || 1,
          max_attempts: task.maxAttempts || 5,
          last_error: task.lastError || null,
        })
        .select()

      if (error) {
        console.error('[RetryQueue] Error queueing task:', error)
        return null
      }

      console.log(`[RetryQueue] Task queued for retry: ${task.taskType}`)
      return data && data.length > 0 ? data[0].id : null
    } catch (error) {
      console.error('[RetryQueue] Exception queueing task:', error)
      return null
    }
  }

  /**
   * Get pending tasks that are ready to retry
   */
  static async getPendingTasks(limit: number = 10): Promise<unknown[]> {
    try {
      const now = new Date()

      const { data } = await this.supabase
        .from('ai_retry_queue')
        .select('*')
        .is('completed_at', null)
        .lte('scheduled_retry_time', now.toISOString())
        .lt('attempt_count', 5) // Only fetch tasks that haven't exceeded max_attempts (default: 5)
        .order('scheduled_retry_time', { ascending: true })
        .limit(limit)

      // Use a raw query for better control
      const { data: tasks, error: queryError } = await this.supabase.rpc('get_pending_ai_tasks', {
        limit_count: limit,
      })

      if (queryError && !data) {
        // Fallback to basic query if RPC not available
        const { data: fallbackData, error: fallbackError } = await this.supabase
          .from('ai_retry_queue')
          .select('*')
          .is('completed_at', null)
          .lte('scheduled_retry_time', now.toISOString())
          .order('scheduled_retry_time', { ascending: true })
          .limit(limit)

        if (fallbackError) {
          console.error('[RetryQueue] Error fetching pending tasks:', fallbackError)
          return []
        }

        return fallbackData || []
      }

      return tasks || data || []
    } catch (error) {
      console.error('[RetryQueue] Exception fetching pending tasks:', error)
      return []
    }
  }

  /**
   * Update retry attempt and schedule next retry
   */
  static async retryTask(
    taskId: string,
    nextRetryTime: Date,
    error?: string,
    _maxAttempts: number = 5
  ): Promise<boolean> {
    try {
      const { error: updateError } = await this.supabase
        .from('ai_retry_queue')
        .update({
          scheduled_retry_time: nextRetryTime.toISOString(),
          attempt_count: this.supabase.rpc('increment_attempt_count', { task_id: taskId }), // Will be replaced by increment in trigger or manual count
          last_error: error || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (updateError) {
        console.error('[RetryQueue] Error updating retry task:', updateError)
        return false
      }

      return true
    } catch (error) {
      console.error('[RetryQueue] Exception updating retry task:', error)
      return false
    }
  }

  /**
   * Simple increment of attempt count
   */
  static async incrementAttempt(taskId: string): Promise<boolean> {
    try {
      // Get current count
      const { data: task, error: fetchError } = await this.supabase
        .from('ai_retry_queue')
        .select('attempt_count')
        .eq('id', taskId)
        .single()

      if (fetchError || !task) {
        console.error('[RetryQueue] Error fetching task:', fetchError)
        return false
      }

      // Update with incremented count
      const { error: updateError } = await this.supabase
        .from('ai_retry_queue')
        .update({
          attempt_count: (task.attempt_count || 1) + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (updateError) {
        console.error('[RetryQueue] Error incrementing attempt:', updateError)
        return false
      }

      return true
    } catch (error) {
      console.error('[RetryQueue] Exception incrementing attempt:', error)
      return false
    }
  }

  /**
   * Mark task as completed
   */
  static async completeTask(taskId: string): Promise<boolean> {
    try {
      const { error } = await this.supabase
        .from('ai_retry_queue')
        .update({
          completed_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (error) {
        console.error('[RetryQueue] Error completing task:', error)
        return false
      }

      console.log(`[RetryQueue] Task completed: ${taskId}`)
      return true
    } catch (error) {
      console.error('[RetryQueue] Exception completing task:', error)
      return false
    }
  }

  /**
   * Mark task as failed (max attempts exceeded)
   */
  static async failTask(taskId: string, error: string): Promise<boolean> {
    try {
      const { error: updateError } = await this.supabase
        .from('ai_retry_queue')
        .update({
          last_error: error,
          updated_at: new Date().toISOString(),
        })
        .eq('id', taskId)

      if (updateError) {
        console.error('[RetryQueue] Error failing task:', updateError)
        return false
      }

      console.log(`[RetryQueue] Task failed: ${taskId} - ${error}`)
      return true
    } catch (error) {
      console.error('[RetryQueue] Exception failing task:', error)
      return false
    }
  }

  /**
   * Get tasks for a specific user
   */
  static async getTasksByUser(userId: string, limit: number = 50): Promise<unknown[]> {
    try {
      const { data, error } = await this.supabase
        .from('ai_retry_queue')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(limit)

      if (error) {
        console.error('[RetryQueue] Error fetching user tasks:', error)
        return []
      }

      return data || []
    } catch (error) {
      console.error('[RetryQueue] Exception fetching user tasks:', error)
      return []
    }
  }

  /**
   * Get retry queue status
   */
  static async getQueueStatus(): Promise<{
    pending: number
    completed: number
    failed: number
  }> {
    try {
      const now = new Date()

      const { data: pending } = await this.supabase
        .from('ai_retry_queue')
        .select('id', { count: 'exact' })
        .is('completed_at', null)
        .lte('scheduled_retry_time', now.toISOString())

      const { data: completed } = await this.supabase
        .from('ai_retry_queue')
        .select('id', { count: 'exact' })
        .not('completed_at', 'is', null)

      const { data: failed } = await this.supabase
        .from('ai_retry_queue')
        .select('id', { count: 'exact' })
        .is('completed_at', null)
        .gte('attempt_count', 5)

      return {
        pending: pending?.length || 0,
        completed: completed?.length || 0,
        failed: failed?.length || 0,
      }
    } catch (error) {
      console.error('[RetryQueue] Exception getting queue status:', error)
      return { pending: 0, completed: 0, failed: 0 }
    }
  }
}

export default RetryQueueService
