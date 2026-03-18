// Tasks Mini App - Full Implementation

interface Task {
  id: number;
  userId: number;
  title: string;
  description: string;
  status: "todo" | "doing" | "done";
  priority: "low" | "medium" | "high";
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
}

// In-memory storage (replace with DB later)
const tasks = new Map<number, Task[]>();

export const createTask = (
  userId: number,
  title: string,
  description: string = "",
  priority: "low" | "medium" | "high" = "medium",
  dueDate?: Date
): Task => {
  const userTasks = tasks.get(userId) || [];
  
  const task: Task = {
    id: Date.now(),
    userId,
    title,
    description,
    status: "todo",
    priority,
    dueDate: dueDate ? new Date(dueDate) : undefined,
    createdAt: new Date(),
  };
  
  userTasks.push(task);
  tasks.set(userId, userTasks);
  
  return task;
};

export const getTasks = (userId: number, status?: string): Task[] => {
  const userTasks = tasks.get(userId) || [];
  if (status) {
    return userTasks.filter(t => t.status === status);
  }
  return userTasks;
};

export const updateTaskStatus = (userId: number, taskId: number, status: "todo" | "doing" | "done"): Task | null => {
  const userTasks = tasks.get(userId) || [];
  const task = userTasks.find(t => t.id === taskId);
  
  if (task) {
    task.status = status;
    if (status === "done") {
      task.completedAt = new Date();
    }
    tasks.set(userId, userTasks);
    return task;
  }
  
  return null;
};

export const deleteTask = (userId: number, taskId: number): boolean => {
  const userTasks = tasks.get(userId) || [];
  const index = userTasks.findIndex(t => t.id === taskId);
  
  if (index !== -1) {
    userTasks.splice(index, 1);
    tasks.set(userId, userTasks);
    return true;
  }
  
  return false;
};

export const getTaskStats = (userId: number) => {
  const userTasks = tasks.get(userId) || [];
  
  return {
    total: userTasks.length,
    todo: userTasks.filter(t => t.status === "todo").length,
    doing: userTasks.filter(t => t.status === "doing").length,
    done: userTasks.filter(t => t.status === "done").length,
    highPriority: userTasks.filter(t => t.priority === "high" && t.status !== "done").length,
    overdue: userTasks.filter(t => t.dueDate && t.dueDate < new Date() && t.status !== "done").length,
  };
};

export const formatTasksList = (userId: number): string => {
  const userTasks = tasks.get(userId) || [];
  
  if (userTasks.length === 0) {
    return "📝 *Задач пока нет*\n\nДобавь задачу: /task_add Название";
  }
  
  const todo = userTasks.filter(t => t.status === "todo");
  const doing = userTasks.filter(t => t.status === "doing");
  const done = userTasks.filter(t => t.status === "done");
  
  let text = "📝 *Задачи*\n\n";
  
  if (todo.length > 0) {
    text += "📋 *К выполнению:*\n";
    text += todo.map(t => `• ${t.title}${t.priority === "high" ? " 🔴" : ""}`).join("\n");
    text += "\n\n";
  }
  
  if (doing.length > 0) {
    text += "🔄 *В процессе:*\n";
    text += doing.map(t => `• ${t.title}`).join("\n");
    text += "\n\n";
  }
  
  if (done.length > 0) {
    text += "✅ *Выполнено:*\n";
    text += done.slice(0, 3).map(t => `• ${t.title}`).join("\n");
    if (done.length > 3) text += `\n... и ещё ${done.length - 3}`;
  }
  
  return text;
};