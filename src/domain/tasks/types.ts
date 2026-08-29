export interface TaskListItem {
  id: string;
  title: string;
  assignee: null;
  due: string | null;
  recurrence: string | null;
  done: boolean;
}

export interface ListTasksInput {
  assignee?: string;
  due_before?: string;
  /** When true, include inactive / completed chores (debugging and history-style views). */
  include_done?: boolean;
}

export interface AddTaskInput {
  title: string;
  assignee?: string;
  due?: string;
  recurrence?: string;
  /** UI server action path */
  description?: string;
  intervalDays?: number;
  deadline?: Date;
}

export interface CompleteTaskInput {
  id: string;
  /** UI session user; MCP passes undefined. */
  userId?: string;
  durationMin?: number;
  /** Set when the UI timer was started; null on quick-complete / MCP. */
  startedAt?: Date;
}

export interface ListChoreHistoryInput {
  limit?: number;
}

export interface ChoreHistoryItem {
  id: string;
  chore_id: string;
  title: string;
  started_at: string | null;
  completed_at: string;
  duration_min: number | null;
  completed_by: string | null;
}
