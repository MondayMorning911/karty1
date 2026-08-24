import React, { useState, useEffect } from 'react';
import { Plus, Calendar, CheckCircle2, Circle, Trash2, Link, Bell, Clock, StickyNote, ChevronDown } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { PlannerNote, PlannerTask, HistoryItem } from '../types';

interface Props {
  uid: string | null;
}

export function PlannerTab({ uid }: Props) {
  const [notes, setNotes] = useState<PlannerNote[]>([]);
  const [tasks, setTasks] = useState<PlannerTask[]>([]);
  const [listings, setListings] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'notes' | 'tasks'>('notes');

  // Note form
  const [noteText, setNoteText] = useState('');
  const [noteListingId, setNoteListingId] = useState<string | null>(null);

  // Task form
  const [taskText, setTaskText] = useState('');
  const [taskListingId, setTaskListingId] = useState<string | null>(null);
  const [taskRemindAt, setTaskRemindAt] = useState('');
  const [addingTask, setAddingTask] = useState(false);

  useEffect(() => {
    if (!uid) return;
    loadData();
  }, [uid]);

  const loadData = async () => {
    if (!uid) { setLoading(false); return; }
    setLoading(true);
    try {
      const [notesRes, tasksRes, listRes] = await Promise.all([
        supabase.from('planner_notes').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('planner_tasks').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
        supabase.from('listings').select('*').eq('user_id', uid).order('created_at', { ascending: false }),
      ]);
      if (notesRes.data) setNotes(notesRes.data as PlannerNote[]);
      if (tasksRes.data) setTasks(tasksRes.data as PlannerTask[]);
      if (listRes.data) {
        setListings(listRes.data.map((d: any) => ({
          id: d.id, title: d.title, desc: d.description || '', date: d.created_at,
          platforms: d.platforms || [], status: d.status, image: d.cover_image, userId: d.user_id,
        })));
      }
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  // Parse date from text (simple Russian date parser)
  const parseDateFromText = (text: string): string | null => {
    const now = new Date();
    const lower = text.toLowerCase();

    // "13 числа", "13-го", "на 13"
    const dayMatch = lower.match(/(\d{1,2})\s*(?:числ[ае]?|[-го]+\s*(?:числа|того)|[-]\s*го)/);
    if (dayMatch) {
      const day = parseInt(dayMatch[1]);
      const date = new Date(now.getFullYear(), now.getMonth(), day);
      if (date < now) date.setMonth(date.getMonth() + 1);

      // Check for time
      const timeMatch = lower.match(/в\s*(\d{1,2})[:\s]*(\d{2})?/);
      if (timeMatch) {
        date.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'), 0, 0);
      } else {
        date.setHours(10, 0, 0, 0); // Default 10:00
      }
      return date.toISOString();
    }

    // "завтра"
    if (lower.includes('завтра')) {
      const tomorrow = new Date(now);
      tomorrow.setDate(tomorrow.getDate() + 1);
      const timeMatch = lower.match(/в\s*(\d{1,2})[:\s]*(\d{2})?/);
      if (timeMatch) {
        tomorrow.setHours(parseInt(timeMatch[1]), parseInt(timeMatch[2] || '0'), 0, 0);
      } else {
        tomorrow.setHours(10, 0, 0, 0);
      }
      return tomorrow.toISOString();
    }

    // "через N дней"
    const inDaysMatch = lower.match(/через\s*(\d+)\s*(?:дн[яе]?|дн)/);
    if (inDaysMatch) {
      const future = new Date(now);
      future.setDate(future.getDate() + parseInt(inDaysMatch[1]));
      future.setHours(10, 0, 0, 0);
      return future.toISOString();
    }

    // "понедельник", "вторник", etc.
    const dayNames: Record<string, number> = {
      'понедельник': 1, 'вторник': 2, 'среда': 3, 'четверг': 4,
      'пятница': 5, 'суббота': 6, 'воскресенье': 0,
    };
    for (const [name, dayNum] of Object.entries(dayNames)) {
      if (lower.includes(name)) {
        const future = new Date(now);
        const currentDay = future.getDay();
        const daysUntil = (dayNum - currentDay + 7) % 7 || 7;
        future.setDate(future.getDate() + daysUntil);
        future.setHours(10, 0, 0, 0);
        return future.toISOString();
      }
    }

    // Date format: DD.MM.YYYY or DD/MM
    const dateMatch = lower.match(/(\d{1,2})[./](\d{1,2})(?:[./](\d{2,4}))?/);
    if (dateMatch) {
      const day = parseInt(dateMatch[1]);
      const month = parseInt(dateMatch[2]) - 1;
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : now.getFullYear();
      const date = new Date(year < 100 ? 2000 + year : year, month, day);
      if (date < now) date.setFullYear(date.getFullYear() + 1);
      date.setHours(10, 0, 0, 0);
      return date.toISOString();
    }

    return null;
  };

  const addNote = async () => {
    if (!uid || !noteText.trim()) return;
    await supabase.from('planner_notes').insert({
      user_id: uid,
      text: noteText.trim(),
      listing_id: noteListingId || null,
    });
    setNoteText('');
    setNoteListingId(null);
    loadData();
  };

  const deleteNote = async (id: string) => {
    await supabase.from('planner_notes').delete().eq('id', id);
    loadData();
  };

  const addTask = async () => {
    if (!uid || !taskText.trim() || addingTask) return;
    setAddingTask(true);
    try {
    let taskForSave = taskText.trim();
    let remindAt: string | null = null;
    try {
      const aiResponse = await fetch('/api/planner/parse-task', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: taskText.trim(), now: new Date().toISOString() }),
      });
      if (aiResponse.ok) {
        const parsed = await aiResponse.json();
        if (parsed.task) taskForSave = parsed.task;
        if (parsed.remind_at) remindAt = parsed.remind_at;
      }
    } catch { /* Use the local Russian date parser below. */ }
    remindAt = remindAt || parseDateFromText(taskText) || taskRemindAt || null;
    const duplicateQuery = await supabase.from('planner_tasks').select('id').eq('user_id', uid).eq('text', taskForSave).eq('done', false);
    if (duplicateQuery.data?.length) { setTaskText(''); setTaskListingId(null); setTaskRemindAt(''); loadData(); return; }
    await supabase.from('planner_tasks').insert({
      user_id: uid,
      text: taskForSave,
      listing_id: taskListingId || null,
      remind_at: remindAt,
    });
    setTaskText('');
    setTaskListingId(null);
    setTaskRemindAt('');
    loadData();
    } finally { setAddingTask(false); }
  };

  const toggleTask = async (task: PlannerTask) => {
    await supabase.from('planner_tasks').update({ done: !task.done }).eq('id', task.id);
    loadData();
  };

  const deleteTask = async (id: string) => {
    await supabase.from('planner_tasks').delete().eq('id', id);
    loadData();
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-[#0A0A0A] transition-colors">
      <div className="absolute top-[-10%] left-[-10%] w-[60%] h-[40%] bg-[#533afd]/5 dark:bg-[#533afd]/15 blur-[80px] rounded-full pointer-events-none" />

      {/* Header */}
      <div className="flex flex-col px-4 pt-4 pb-3 pr-16 bg-white/90 dark:bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-white/5 z-10">
        <h1 className="text-[26px] font-bold tracking-tight">Планер</h1>
        <p className="text-[13px] text-slate-500 dark:text-gray-400 mt-1">Заметки и напоминания</p>

        {/* Section toggle */}
        <div className="flex gap-2 mt-3">
          <button
            onClick={() => setActiveSection('notes')}
            className={`flex-1 py-2 rounded-xl text-[13px] font-medium transition-all ${
              activeSection === 'notes'
                ? 'bg-[#533afd] text-white'
                : 'bg-slate-100 dark:bg-white/[0.03] text-slate-600 dark:text-gray-400'
            }`}
          >
            <StickyNote size={14} className="inline mr-1.5" /> Заметки
          </button>
          <button
            onClick={() => setActiveSection('tasks')}
            className={`flex-1 py-2 rounded-xl text-[13px] font-medium transition-all ${
              activeSection === 'tasks'
                ? 'bg-[#533afd] text-white'
                : 'bg-slate-100 dark:bg-white/[0.03] text-slate-600 dark:text-gray-400'
            }`}
          >
            <Bell size={14} className="inline mr-1.5" /> Задачи
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {loading && <p className="text-center text-sm text-gray-500 mt-4">Загрузка...</p>}

        {/* Notes Section */}
        {activeSection === 'notes' && !loading && (
          <>
            {/* Add note form */}
            <div className="bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-3">
              <textarea
                value={noteText}
                onChange={e => setNoteText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-xl text-[13px] outline-none focus:border-[#533afd] transition-colors resize-none"
                placeholder="Напишите заметку..."
                rows={3}
              />

              {/* Link to listing */}
              <div className="mt-2 flex gap-2">
                <select
                  value={noteListingId || ''}
                  onChange={e => setNoteListingId(e.target.value || null)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-xl text-[12px] outline-none"
                >
                  <option value="">Без привязки к объекту</option>
                  {listings.map(l => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
                <button
                  onClick={addNote}
                  disabled={!noteText.trim()}
                  className="px-4 py-2 bg-[#533afd] text-white rounded-xl text-[12px] font-medium hover:bg-[#4330e0] disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>
            </div>

            {/* Notes list */}
            {notes.length === 0 && (
              <p className="text-center text-[13px] text-slate-400 dark:text-gray-500 mt-8">Нет заметок</p>
            )}
            {notes.map(note => (
              <div key={note.id} className="bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-3">
                <p className="text-[13px] whitespace-pre-wrap">{note.text}</p>
                {note.listing_id && listings.find(l => l.id === note.listing_id) && (
                  <div className="mt-2 flex items-center gap-2 p-2 bg-slate-50 dark:bg-white/[0.03] rounded-xl">
                    <Link size={12} className="text-[#533afd] shrink-0" />
                    <span className="text-[11px] text-slate-500 dark:text-gray-400 truncate">
                      {listings.find(l => l.id === note.listing_id)?.title}
                    </span>
                  </div>
                )}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[10px] text-slate-400 dark:text-gray-500">
                    {new Date(note.created_at).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  </span>
                  <button onClick={() => deleteNote(note.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}

        {/* Tasks Section */}
        {activeSection === 'tasks' && !loading && (
          <>
            {/* Add task form */}
            <div className="bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-3">
              <input
                value={taskText}
                onChange={e => setTaskText(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-xl text-[13px] outline-none focus:border-[#533afd] transition-colors"
                placeholder="Например: 13 числа перезвонить Александру"
                onKeyDown={e => e.key === 'Enter' && addTask()}
              />

              <div className="mt-2 flex gap-2">
                <select
                  value={taskListingId || ''}
                  onChange={e => setTaskListingId(e.target.value || null)}
                  className="flex-1 px-3 py-2 bg-slate-50 dark:bg-white/[0.03] border border-slate-200/80 dark:border-white/10 rounded-xl text-[12px] outline-none"
                >
                  <option value="">Без привязки к объекту</option>
                  {listings.map(l => (
                    <option key={l.id} value={l.id}>{l.title}</option>
                  ))}
                </select>
                <button
                  onClick={addTask}
                  disabled={!taskText.trim()}
                  className="px-4 py-2 bg-[#533afd] text-white rounded-xl text-[12px] font-medium hover:bg-[#4330e0] disabled:opacity-50 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              {parseDateFromText(taskText) && (
                <p className="mt-2 text-[11px] text-[#533afd] flex items-center gap-1">
                  <Clock size={12} />
                  Напоминание: {new Date(parseDateFromText(taskText)!).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                </p>
              )}
            </div>

            {/* Tasks list */}
            {tasks.length === 0 && (
              <p className="text-center text-[13px] text-slate-400 dark:text-gray-500 mt-8">Нет задач</p>
            )}
            {tasks.map(task => (
              <div key={task.id} className={`bg-white dark:bg-white/[0.02] border border-slate-200/80 dark:border-white/5 rounded-[16px] p-3 ${task.done ? 'opacity-60' : ''}`}>
                <div className="flex items-start gap-3">
                  <button onClick={() => toggleTask(task)} className="mt-0.5 shrink-0">
                    {task.done ? (
                      <CheckCircle2 size={20} className="text-green-500" />
                    ) : (
                      <Circle size={20} className="text-slate-300 dark:text-gray-600 hover:text-[#533afd] transition-colors" />
                    )}
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className={`text-[13px] ${task.done ? 'line-through text-slate-400 dark:text-gray-500' : ''}`}>{task.text}</p>
                    {task.listing_id && listings.find(l => l.id === task.listing_id) && (
                      <div className="mt-1.5 flex items-center gap-1.5 text-[#533afd]">
                        <Link size={11} />
                        <span className="text-[11px] truncate">{listings.find(l => l.id === task.listing_id)?.title}</span>
                      </div>
                    )}
                    {task.remind_at && !task.done && (
                      <div className="mt-1 flex items-center gap-1 text-slate-400 dark:text-gray-500">
                        <Bell size={11} />
                        <span className="text-[10px]">
                          {new Date(task.remind_at).toLocaleString('ru-RU', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    )}
                  </div>
                  <button onClick={() => deleteTask(task.id)} className="p-1 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg text-slate-400 hover:text-red-500 transition-colors shrink-0">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}
