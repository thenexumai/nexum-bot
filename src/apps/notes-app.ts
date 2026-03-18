// Notes Mini App - Full Implementation

interface Note {
  id: number;
  userId: number;
  title: string;
  content: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}

// In-memory storage (replace with DB later)
const notes = new Map<number, Note[]>();

export const createNote = (
  userId: number,
  title: string,
  content: string,
  tags: string[] = []
): Note => {
  const userNotes = notes.get(userId) || [];
  
  const note: Note = {
    id: Date.now(),
    userId,
    title,
    content,
    tags,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  
  userNotes.push(note);
  notes.set(userId, userNotes);
  
  return note;
};

export const getNotes = (userId: number, search?: string, tag?: string): Note[] => {
  let userNotes = notes.get(userId) || [];
  
  if (search) {
    const lowerSearch = search.toLowerCase();
    userNotes = userNotes.filter(n => 
      n.title.toLowerCase().includes(lowerSearch) || 
      n.content.toLowerCase().includes(lowerSearch)
    );
  }
  
  if (tag) {
    userNotes = userNotes.filter(n => n.tags.includes(tag));
  }
  
  return userNotes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
};

export const getNote = (userId: number, noteId: number): Note | null => {
  const userNotes = notes.get(userId) || [];
  return userNotes.find(n => n.id === noteId) || null;
};

export const updateNote = (
  userId: number,
  noteId: number,
  updates: { title?: string; content?: string; tags?: string[] }
): Note | null => {
  const userNotes = notes.get(userId) || [];
  const note = userNotes.find(n => n.id === noteId);
  
  if (note) {
    if (updates.title) note.title = updates.title;
    if (updates.content) note.content = updates.content;
    if (updates.tags) note.tags = updates.tags;
    note.updatedAt = new Date();
    notes.set(userId, userNotes);
    return note;
  }
  
  return null;
};

export const deleteNote = (userId: number, noteId: number): boolean => {
  const userNotes = notes.get(userId) || [];
  const index = userNotes.findIndex(n => n.id === noteId);
  
  if (index !== -1) {
    userNotes.splice(index, 1);
    notes.set(userId, userNotes);
    return true;
  }
  
  return false;
};

export const getNoteStats = (userId: number) => {
  const userNotes = notes.get(userId) || [];
  
  const allTags = userNotes.flatMap(n => n.tags);
  const tagCounts = allTags.reduce((acc, tag) => {
    acc[tag] = (acc[tag] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
  
  return {
    total: userNotes.length,
    tags: Object.keys(tagCounts).length,
    topTags: Object.entries(tagCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([tag, count]) => ({ tag, count })),
  };
};

export const formatNotesList = (userId: number, limit: number = 10): string => {
  const userNotes = notes.get(userId) || [];
  
  if (userNotes.length === 0) {
    return "📝 *Заметок пока нет*\n\nДобавь заметку: /note_add Заголовок | Текст";
  }
  
  const sortedNotes = userNotes
    .sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
    .slice(0, limit);
  
  let text = "📝 *Заметки*\n\n";
  
  sortedNotes.forEach(note => {
    const preview = note.content.substring(0, 50);
    const tags = note.tags.length > 0 ? ` [${note.tags.join(", ")}]` : "";
    text += `*${note.title}*${tags}\n`;
    text += `${preview}${note.content.length > 50 ? "..." : ""}\n\n`;
  });
  
  if (userNotes.length > limit) {
    text += `_Показано ${limit} из ${userNotes.length}_`;
  }
  
  return text;
};