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
}
