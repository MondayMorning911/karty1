import React, { useState, useEffect, useRef } from 'react';
import { Play, RefreshCw, Search, Users, BarChart3, Loader2, Clock, Power, PowerOff, X, CheckCircle2, AlertCircle, Globe } from 'lucide-react';
import { crmFetch } from '../lib/crmApi';

const API = ''; // Same origin, proxy handles /api/realtors/*

interface Realtor {
  phone: string;
  name: string;
  source: string;
  listing_url: string;
  profile_url: string;
  listings_count: number;
  verified: number;
}

interface Stats {
  total: number;
  by_source: Record<string, number>;
  top_realtors: Array<{ name: string; phone: string; source: string; listings_count: number }>;
}

interface ParseStatus {
  status: string;
  realtors_found: number;
  total_in_db: number;
  by_source: Record<string, number>;
  error: string;
  current_site: string;
  current_category: string;
  current_url: string;
  current_date: string;
  processed_count: number;
  total_urls: number;
  status_text: string;
}

interface ParseHistoryEntry {
  task_id: string;
  mode: string;
  sites: string[];
  realtors_found: number;
  total_in_db: number;
  by_source: Record<string, number>;
  timestamp: string;
  status: string;
  error?: string;
}

interface CategoryProgress {
  [site: string]: {
    [categoryUrl: string]: {
      status: 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';
      processed: number;
      found: number;
      current_url: string;
      pages_done: number;
      current_date?: string;
      error?: string;
    };
  };
}

export function ParserTab() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [realtors, setRealtors] = useState<Realtor[]>([]);
  const [parsing, setParsing] = useState(false);
  const [parseStatus, setParseStatus] = useState<ParseStatus | null>(null);
  const [filterSource, setFilterSource] = useState('');
  const [filterMin, setFilterMin] = useState(20);
  const [loading, setLoading] = useState(false);
  const [schedulerActive, setSchedulerActive] = useState(false);
  const [schedulerLoading, setSchedulerLoading] = useState(false);
  const [parseHistory, setParseHistory] = useState<ParseHistoryEntry[]>([]);
  const [currentTaskId, setCurrentTaskId] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const pollingTaskRef = useRef<string | null>(null);
  const [categoryProgress, setCategoryProgress] = useState<CategoryProgress>({});

  const categoryNameFromUrl = (url: string): string => {
    try {
      const decoded = decodeURIComponent(url);
      const segments = decoded.split('/').filter(Boolean);
      const last = segments[segments.length - 1] || url;
      return last.replace(/-/g, ' ');
    } catch {
      return url;
    }
  };

  // Helper: save task_id to localStorage for persistence across tab switches
  const saveTaskId = (taskId: string | null) => {
    if (taskId) {
      localStorage.setItem('parser_task_id', taskId);
    } else {
      localStorage.removeItem('parser_task_id');
    }
  };

  // Helper: poll a task until completion (works across tab switches)
  const pollTask = async (taskId: string) => {
    if (pollingTaskRef.current === taskId) return;
    pollingTaskRef.current = taskId;
    // Immediate first poll to show progress right away
    try {
      const sr = await crmFetch(`${API}/api/realtors/status/${taskId}`);
      const s: ParseStatus = await sr.json();
      setParseStatus(s);
      const cpr = await crmFetch(`${API}/api/realtors/categories/${taskId}`);
      if (cpr.ok) {
        const data = await cpr.json() as { categories?: CategoryProgress };
        setCategoryProgress(data.categories || data);
      }
    } catch {}

    for (let i = 0; i < 2880; i++) { // 2880 * 5s = 4 hours max
      await new Promise(r => setTimeout(r, 5000));
      try {
        const sr = await crmFetch(`${API}/api/realtors/status/${taskId}`);
        const s: ParseStatus = await sr.json();
        setParseStatus(s);

        // Poll per-category progress
        try {
          const cpr = await crmFetch(`${API}/api/realtors/categories/${taskId}`);
          if (cpr.ok) {
            const cpData = await cpr.json() as { categories?: CategoryProgress };
            setCategoryProgress(cpData.categories || cpData);
          }
        } catch {}

        // Dynamic stats update
        if (i % 2 === 0) {
          loadStats();
          loadRealtors();
        }

        if (s.status === 'completed' || s.status === 'failed' || s.status === 'cancelled') {
          setParsing(false);
          pollingTaskRef.current = null;
          if (s.status === 'cancelled') {
            // Keep task_id so "Продолжить" can resume from the saved checkpoint
            setCurrentTaskId(taskId);
            saveTaskId(taskId);
          } else {
            setCurrentTaskId(null);
            saveTaskId(null);
          }
          loadStats();
          loadRealtors();
          loadHistory();
          return;
        }
      } catch {}
    }
    setParsing(false);
    pollingTaskRef.current = null;
    setCurrentTaskId(null);
    saveTaskId(null);
  };

  const loadStats = async () => {
    try {
      const r = await crmFetch(`${API}/api/realtors/stats`);
      setStats(await r.json());
    } catch (e) { console.error(e); }
  };

  const loadRealtors = async () => {
    setLoading(true);
    try {
      let url = `${API}/api/realtors/list?limit=200`;
      if (filterSource) url += `&source=${filterSource}`;
      if (filterMin) url += `&min_listings=${filterMin}`;
      const r = await fetch(url);
      const data = await r.json();
      setRealtors(data.realtors || []);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  const startParse = async (mode: 'daily' | 'full') => {
    setParsing(true);
    setParseStatus(null);
    setCategoryProgress({});
    setCurrentTaskId(null);
    try {
      const r = await crmFetch(`${API}/api/realtors/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, sites: ['korter', 'ssge'], max_per_site: mode === 'full' ? 2000 : 200 }),
      });
      const data = await r.json();

      if (!r.ok) {
        // 409 Conflict — parse already running
        if (r.status === 409 && data.detail) {
          alert(`Парсинг уже запущен: ${data.detail}`);
          // Try to recover — check if the running task is still active
          const savedTaskId = localStorage.getItem('parser_task_id');
          if (savedTaskId) {
            const sr = await crmFetch(`${API}/api/realtors/status/${savedTaskId}`);
            const s: ParseStatus = await sr.json();
            if (s.status === 'processing') {
              setCurrentTaskId(savedTaskId);
              setParseStatus(s);
              pollTask(savedTaskId);
              return;
            }
          }
        }
        setParsing(false);
        return;
      }

      if (!data.task_id) { setParsing(false); return; }
      setCurrentTaskId(data.task_id);
      saveTaskId(data.task_id);
      pollTask(data.task_id);
    } catch (e) {
      console.error(e);
      setParsing(false);
      setCurrentTaskId(null);
    }
  };

  const cancelParse = async () => {
    if (!currentTaskId) return;
    setCancelling(true);
    try {
      await crmFetch(`${API}/api/realtors/cancel/${currentTaskId}`, { method: 'POST' });
    } catch (e) { console.error(e); }
    setCancelling(false);
  };

  const resumeParse = async () => {
    if (!currentTaskId) return;
    try {
      const r = await crmFetch(`${API}/api/realtors/resume/${currentTaskId}`, { method: 'POST' });
      const { task_id } = await r.json();
      if (task_id) {
        setCurrentTaskId(task_id);
        saveTaskId(task_id);
        setParsing(true);
        pollTask(task_id);
      }
    } catch (e) { console.error(e); }
  };

  const toggleScheduler = async () => {
    setSchedulerLoading(true);
    try {
      const newActive = !schedulerActive;
      const response = await crmFetch(`${API}/api/realtors/scheduler`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ active: newActive }),
      });
      if (!response.ok) throw new Error(`Scheduler request failed: ${response.status}`);
      const state = await response.json();
      setSchedulerActive(!!state.active);
    } catch (e) { console.error(e); }
    setSchedulerLoading(false);
  };

  const loadHistory = async () => {
    try {
      const r = await crmFetch(`${API}/api/realtors/history`);
      const data = await r.json();
      setParseHistory(data.history || []);
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    loadStats();
    loadRealtors();
    loadHistory();
    crmFetch(`${API}/api/realtors/scheduler`).then(r => r.json()).then(d => setSchedulerActive(d.active)).catch(() => {});

    // Recover an active task from SQLite when localStorage was cleared or the tab was reopened.
    let recovered = false;
    const recoverActiveTask = () => crmFetch(`${API}/api/realtors/health`)
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (recovered) return;
        const activeTask = data?.tasks?.find((task: ParseStatus) =>
          task.status === 'running' || task.status === 'in_progress' || task.status === 'stalled'
        );
        if (!activeTask) {
          const last = data?.last_finished_task;
           if (last && (last.status === 'cancelled' || last.status === 'failed')) {
            // Nothing running, but a cancelled/failed task has a checkpoint — offer resume
            recovered = true;
            setCurrentTaskId(last.task_id);
            saveTaskId(last.task_id);
            setParseStatus({
              status: last.status === 'failed' ? 'failed' : 'cancelled',
              realtors_found: last.realtors_found || 0,
              total_in_db: 0,
              by_source: {},
              error: last.last_error || '',
              current_site: last.current_site || '',
              current_category: last.current_category_url || '',
              current_url: last.current_url || '',
              current_date: '',
              processed_count: last.processed_count || 0,
              total_urls: last.total_urls || 0,
              status_text: 'Приостановлено — нажмите «Продолжить»',
            });
          }
          return;
        }
        recovered = true;
        setParsing(true);
        setCurrentTaskId(activeTask.task_id);
        saveTaskId(activeTask.task_id);
        setParseStatus({
           status: activeTask.status === 'running' || activeTask.status === 'in_progress' || activeTask.status === 'stalled' ? 'processing' : activeTask.status,
          realtors_found: activeTask.realtors_found || 0,
          total_in_db: 0,
          by_source: {},
          error: activeTask.last_error || '',
          current_site: activeTask.current_site || '',
          current_category: activeTask.current_category_url || '',
          current_url: activeTask.current_url || '',
          current_date: '',
          processed_count: activeTask.processed_count || 0,
          total_urls: activeTask.total_urls || 0,
          status_text: 'Восстановлено из persistent task state',
        });
        pollTask(activeTask.task_id);
      })
      .catch(() => {});
    recoverActiveTask();
    const recoveryInterval = setInterval(recoverActiveTask, 5000);

    // Check if there's a running task from a previous tab (persisted in localStorage)
    const savedTaskId = localStorage.getItem('parser_task_id');
    if (savedTaskId) {
      crmFetch(`${API}/api/realtors/status/${savedTaskId}`)
        .then(r => {
          if (!r.ok) {
            // Task not found on server — clean up
            localStorage.removeItem('parser_task_id');
            return null;
          }
          return r.json();
        })
        .then(s => {
          if (s && s.status === 'processing') {
            setParsing(true);
            setCurrentTaskId(savedTaskId);
            setParseStatus(s);
            pollTask(savedTaskId);
          } else if (s && s.status === 'cancelled') {
            // Cancelled task — show panel with restore button, keep id for resume
            setCurrentTaskId(savedTaskId);
            setParseStatus(s);
          } else if (s) {
            // Task finished while we were away
            localStorage.removeItem('parser_task_id');
            loadStats();
            loadRealtors();
            loadHistory();
          }
        })
        .catch(() => {
          localStorage.removeItem('parser_task_id');
        });
    }
    return () => clearInterval(recoveryInterval);
  }, []);

  const siteCards = Object.entries(categoryProgress).map(([site, categories]) => {
    const entries = Object.entries(categories);
    return {
      site,
      categories: entries,
      active: entries.filter(([, category]) => category.status === 'running').length,
      completed: entries.filter(([, category]) => category.status === 'completed').length,
      failed: entries.filter(([, category]) => category.status === 'failed').length,
      processed: entries.reduce((sum, [, category]) => sum + category.processed, 0),
      found: entries.reduce((sum, [, category]) => sum + category.found, 0),
    };
  });
  const totalCategories = siteCards.reduce((sum, site) => sum + site.categories.length, 0);
  const activeCategories = siteCards.reduce((sum, site) => sum + site.active, 0);
  const completedCategories = siteCards.reduce((sum, site) => sum + site.completed, 0);

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <StatCard icon={<Users />} label="Всего риэлторов" value={stats.total} color="#533afd" />
          <StatCard icon={<BarChart3 />} label="korter.ge" value={stats.by_source?.korter || 0} color="#ff6b35" />
          <StatCard icon={<BarChart3 />} label="ss.ge" value={stats.by_source?.ssge || 0} color="#3b82f6" />
        </div>
      )}

      {/* Parse Controls */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl p-6 border border-[#e5edf5] dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">Парсер риэлторов</h3>
          <button
            onClick={toggleScheduler}
            disabled={schedulerLoading}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-[13px] font-semibold transition-all ${
              schedulerActive
                ? 'bg-green-500 text-white hover:bg-green-600'
                : 'bg-[#f6f9fc] dark:bg-white/[0.05] border border-[#e5edf5] dark:border-white/10 text-[#64748d] hover:bg-green-50 hover:border-green-300 hover:text-green-600'
            }`}
          >
            {schedulerActive ? <><Power size={14} /> Авто-парсинг · 22:00</> : <><Clock size={14} /> Авто-парсинг выкл</>}
          </button>
        </div>
        <div className="flex gap-3 mb-4">
          <button
            onClick={() => startParse('daily')}
            disabled={parsing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#533afd] text-white rounded-xl font-medium text-sm hover:bg-[#4330e0] disabled:opacity-50 transition-colors"
          >
            {parsing ? <Loader2 size={16} className="animate-spin" /> : <Play size={16} />}
            Ежедневный парсинг
          </button>
          <button
            onClick={() => startParse('full')}
            disabled={parsing}
            className="flex items-center gap-2 px-5 py-2.5 bg-[#061b31] dark:bg-white/10 text-white rounded-xl font-medium text-sm hover:bg-[#0a2540] dark:hover:bg-white/15 disabled:opacity-50 transition-colors"
          >
            {parsing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />}
            Полный парсинг
          </button>
        </div>

        {parseStatus && (
          <div className="p-4 bg-[#f6f9fc] dark:bg-white/[0.03] rounded-xl text-sm">
            <div className="flex items-center justify-between mb-2">
              <span className={`font-medium ${parseStatus.status === 'completed' ? 'text-green-600' : parseStatus.status === 'failed' ? 'text-red-500' : parseStatus.status === 'cancelled' ? 'text-orange-500' : 'text-[#533afd]'}`}>
                {parseStatus.status === 'completed' ? 'Завершено' : 
                 parseStatus.status === 'failed' ? 'Ошибка' : 
                 parseStatus.status === 'cancelled' ? 'Отменено' :
                 parseStatus.status === 'cancelling' ? 'Отмена...' : 'Выполняется...'}
              </span>
              {parsing && parseStatus.status === 'processing' && (
                <button
                  onClick={cancelParse}
                  disabled={cancelling}
                  className="flex items-center gap-1 px-3 py-1 bg-red-500 text-white rounded-lg text-xs font-medium hover:bg-red-600 disabled:opacity-50"
                >
                  {cancelling ? <Loader2 size={12} className="animate-spin" /> : <X size={12} />}
                  Отменить
                </button>
              )}
              {!parsing && parseStatus.status === 'cancelled' && (
                <button
                  onClick={resumeParse}
                  className="flex items-center gap-1 px-3 py-1 bg-blue-500 text-white rounded-lg text-xs font-medium hover:bg-blue-600"
                >
                  <RefreshCw size={12} />
                  Продолжить
                </button>
              )}
            </div>
            
            {/* Overall parse progress */}
            {parseStatus.status === 'processing' && (
              <div className="mt-3 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[#64748d]">Общий прогресс</div>
                    <div className="text-lg font-bold text-[#061b31] dark:text-white mt-1">{completedCategories}/{totalCategories || '—'}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[#64748d]">Активно сейчас</div>
                    <div className="text-lg font-bold text-[#533afd] mt-1">{activeCategories}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[#64748d]">Обработано</div>
                    <div className="text-lg font-bold text-[#061b31] dark:text-white mt-1">{siteCards.reduce((sum, site) => sum + site.processed, 0)}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[10px] uppercase tracking-wide text-[#64748d]">Найдено новых</div>
                    <div className="text-lg font-bold text-green-600 mt-1">+{siteCards.reduce((sum, site) => sum + site.found, 0)}</div>
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between text-xs text-[#64748d] mb-1.5">
                    <span>Завершение категорий</span>
                    <span>{totalCategories ? Math.round((completedCategories / totalCategories) * 100) : 0}%</span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                    <div className="bg-[#533afd] h-2 rounded-full transition-all duration-500" style={{ width: `${totalCategories ? (completedCategories / totalCategories) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="rounded-xl border border-[#e5edf5] dark:border-white/10 p-3">
                  <div className="flex items-center justify-between gap-3 mb-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Loader2 size={14} className="animate-spin text-[#533afd] shrink-0" />
                      <span className="font-medium text-[#061b31] dark:text-white">Текущий процесс</span>
                    </div>
                    <span className="text-xs text-[#64748d] shrink-0">{parseStatus.current_site || 'ожидание'}</span>
                  </div>
                  {parseStatus.current_category && <div className="text-xs text-[#64748d] truncate" title={parseStatus.current_category}>{parseStatus.current_category}</div>}
                  {parseStatus.current_url && <div className="text-[11px] text-[#94a3b8] truncate mt-1" title={parseStatus.current_url}>{parseStatus.current_url}</div>}
                  <div className="text-xs text-[#64748d] mt-2">Текущая категория: {parseStatus.processed_count} объектов обработано</div>
                </div>
                {parseStatus.status_text && (
                  <div className="text-[#64748d] text-xs italic">{parseStatus.status_text}</div>
                )}
              </div>
            )}

            {/* Process monitor: one site card with every category inside it. */}
            {siteCards.length > 0 && (
              <div className="mt-4 pt-4 border-t border-[#e5edf5] dark:border-white/10 space-y-4">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  <div className="rounded-xl bg-[#061b31] text-white p-3">
                    <div className="text-[11px] text-white/60 uppercase tracking-wide">Активные процессы</div>
                    <div className="text-2xl font-bold mt-1">{activeCategories}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[11px] text-[#64748d] uppercase tracking-wide">Категории</div>
                    <div className="text-2xl font-bold text-[#061b31] dark:text-white mt-1">{completedCategories}/{totalCategories}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[11px] text-[#64748d] uppercase tracking-wide">Обработано</div>
                    <div className="text-2xl font-bold text-[#061b31] dark:text-white mt-1">{siteCards.reduce((sum, site) => sum + site.processed, 0)}</div>
                  </div>
                  <div className="rounded-xl bg-[#f6f9fc] dark:bg-white/[0.05] p-3">
                    <div className="text-[11px] text-[#64748d] uppercase tracking-wide">Найдено новых</div>
                    <div className="text-2xl font-bold text-green-600 mt-1">+{siteCards.reduce((sum, site) => sum + site.found, 0)}</div>
                  </div>
                </div>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                  {siteCards.map(({ site, categories, active, completed, failed, processed, found }) => {
                    const siteColor = site === 'korter' ? '#ff6b35' : site === 'ssge' ? '#3b82f6' : '#533afd';
                    return (
                      <div key={site} className="rounded-2xl border border-[#e5edf5] dark:border-white/10 overflow-hidden">
                        <div className="p-4 bg-white dark:bg-[#1A1A1A] flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: `${siteColor}18` }}>
                              <Globe size={19} style={{ color: siteColor }} />
                            </div>
                            <div>
                              <div className="font-bold text-[#061b31] dark:text-white">{site}.ge</div>
                              <div className="text-xs text-[#64748d]">{active} активно · {completed}/{categories.length} завершено</div>
                            </div>
                          </div>
                          <div className="text-right text-xs text-[#64748d]">
                            <div>{processed} обработано</div>
                            <div className="text-green-600 font-semibold">+{found} найдено</div>
                          </div>
                        </div>
                        <div className="p-3 bg-[#f8fafc] dark:bg-white/[0.025] space-y-2">
                          {categories.map(([catUrl, cat]) => {
                            const statusLabel = cat.status === 'running' ? 'работает' : cat.status === 'completed' ? 'готово' : cat.status === 'failed' ? 'ошибка' : cat.status === 'cancelled' ? 'отменено' : 'ожидает';
                            const statusColor = cat.status === 'running' ? siteColor : cat.status === 'completed' ? '#22c55e' : cat.status === 'failed' ? '#ef4444' : cat.status === 'cancelled' ? '#f97316' : '#94a3b8';
                            return (
                              <div key={catUrl} className="rounded-xl bg-white dark:bg-[#1A1A1A] border border-[#e5edf5] dark:border-white/10 p-3">
                                <div className="flex items-start justify-between gap-3">
                                  <div className="min-w-0">
                                    <div className="text-xs font-medium text-[#061b31] dark:text-white truncate" title={catUrl}>{categoryNameFromUrl(catUrl)}</div>
                                    <div className="text-[10px] text-[#94a3b8] mt-1 truncate" title={catUrl}>{catUrl}</div>
                                  </div>
                                  <div className="flex items-center gap-1.5 shrink-0 text-[10px]" style={{ color: statusColor }}>
                                    {cat.status === 'running' ? <Loader2 size={12} className="animate-spin" /> : cat.status === 'completed' ? <CheckCircle2 size={12} /> : cat.status === 'failed' ? <AlertCircle size={12} /> : null}
                                    <span>{statusLabel}</span>
                                  </div>
                                </div>
                                <div className="flex items-center justify-between mt-3 text-[10px] text-[#64748d]">
                                  <span>{cat.processed} объектов · стр. {cat.pages_done || 1}</span>
                                  <span className="text-green-600">+{cat.found} новых</span>
                                  {cat.current_url && <span className="max-w-[42%] truncate" title={cat.current_url}>текущий объект</span>}
                                </div>
                                {cat.current_date && <div className="text-[10px] text-[#64748d] mt-1">Дата: {cat.current_date}</div>}
                                {cat.error && <div className="text-[10px] text-red-500 mt-2 truncate" title={cat.error}>{cat.error}</div>}
                              </div>
                            );
                          })}
                          {failed > 0 && <div className="text-[10px] text-red-500 px-1">Ошибок категорий: {failed}</div>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
            
            {parseStatus.status === 'completed' && (
              <span className="ml-2 text-[#64748d]">
                Найдено: {parseStatus.realtors_found}, Всего в БД: {parseStatus.total_in_db}
              </span>
            )}
            {parseStatus.error && <span className="ml-2 text-red-500">{parseStatus.error}</span>}
          </div>
        )}
      </div>

      {/* Parse History */}
      {parseHistory.length > 0 && (
        <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl p-6 border border-[#e5edf5] dark:border-white/10">
          <h3 className="text-lg font-bold mb-4">История парсинга</h3>
          <div className="space-y-2">
            {parseHistory.slice(0, 10).map((entry, i) => (
              <div key={i} className="flex items-center justify-between p-3 bg-[#f6f9fc] dark:bg-white/[0.03] rounded-xl text-sm">
                <div className="flex items-center gap-3">
                  <span className={`w-2 h-2 rounded-full ${entry.status === 'completed' ? 'bg-green-500' : 'bg-red-500'}`} />
                  <span className="font-medium text-[#061b31] dark:text-white">
                    {entry.mode === 'full' ? 'Полный' : 'Ежедневный'}
                  </span>
                  <span className="text-[#64748d]">
                    {entry.sites.join(', ')}
                  </span>
                </div>
                <div className="flex items-center gap-4 text-[#64748d]">
                  <span className="text-green-600 font-medium">+{entry.realtors_found}</span>
                  <span>Всего: {entry.total_in_db}</span>
                  <span className="text-xs">{new Date(entry.timestamp).toLocaleString('ru-RU')}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Realtor Table */}
      <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl p-6 border border-[#e5edf5] dark:border-white/10">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold">База риэлторов</h3>
          <div className="flex gap-2">
            <select
              value={filterSource}
              onChange={e => { setFilterSource(e.target.value); }}
              className="px-3 py-1.5 text-sm border border-[#e5edf5] dark:border-white/10 rounded-lg bg-[#f6f9fc] dark:bg-white/[0.03]"
            >
              <option value="">Все сайты</option>
              <option value="korter">korter.ge</option>
              <option value="ssge">ss.ge</option>
              <option value="myhome">myhome.ge</option>
            </select>
            <input
              type="number"
              placeholder="Мин. объяв."
              value={filterMin || ''}
              onChange={e => setFilterMin(Number(e.target.value))}
              className="w-24 px-3 py-1.5 text-sm border border-[#e5edf5] dark:border-white/10 rounded-lg bg-[#f6f9fc] dark:bg-white/[0.03]"
            />
            <button
              onClick={loadRealtors}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#533afd] text-white rounded-lg text-sm font-medium hover:bg-[#4330e0] transition-colors"
            >
              <Search size={14} /> Найти
            </button>
          </div>
        </div>

        <div className="overflow-auto max-h-[400px]">
          <table className="crm-parser-table w-full text-sm">
            <thead>
              <tr className="border-b border-[#e5edf5] dark:border-white/10 text-left text-[#64748d]">
                <th className="pb-3 font-medium">Имя</th>
                <th className="pb-3 font-medium">Телефон</th>
                <th className="pb-3 font-medium">Сайт</th>
                <th className="pb-3 font-medium">Объявл.</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={4} className="py-8 text-center text-[#64748d]"><Loader2 className="animate-spin inline mr-2" size={16} />Загрузка...</td></tr>
              ) : realtors.length === 0 ? (
                <tr><td colSpan={4} className="py-8 text-center text-[#64748d]">Нет данных</td></tr>
              ) : (
                realtors.map((r, i) => (
                  <tr key={i} className="border-b border-[#e5edf5] dark:border-white/5 hover:bg-[#f6f9fc] dark:hover:bg-white/[0.02] transition-colors">
                    <td className="py-2.5 font-medium">{r.name || '—'}</td>
                    <td className="py-2.5 text-[#64748d]">{r.phone}</td>
                    <td className="py-2.5"><span className="px-2 py-0.5 bg-[#f6f9fc] dark:bg-white/[0.05] rounded text-xs">{r.source}</span></td>
                    <td className="py-2.5 font-medium">{r.listings_count}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, color }: { icon: React.ReactNode; label: string; value: number; color: string }) {
  return (
    <div className="bg-white dark:bg-[#1A1A1A] rounded-2xl p-5 border border-[#e5edf5] dark:border-white/10">
      <div className="flex items-center gap-3 mb-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ backgroundColor: color + '15', color }}>
          {icon}
        </div>
        <span className="text-[13px] text-[#64748d] font-medium">{label}</span>
      </div>
      <p className="text-[28px] font-bold tracking-tight">{value}</p>
    </div>
  );
}
