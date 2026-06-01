import { createAdminClient } from '@/lib/supabase/admin';
import type { CompetitorPost, ClientPost, ContentIdea, Script, ScheduledPost } from './types';

export async function getCompetitorPosts(): Promise<CompetitorPost[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('competitor_posts')
    .select('*')
    .order('likes', { ascending: false })
    .limit(50);

  if (error) throw error;
  return data || [];
}

export async function getClientPosts(): Promise<ClientPost[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('client_posts')
    .select('*')
    .order('posted_at', { ascending: false })
    .limit(25);

  if (error) throw error;
  return data || [];
}

export async function getTodayIdeas(): Promise<ContentIdea[]> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('content_ideas')
    .select('*')
    .eq('status', 'pending')
    .gte('created_at', `${today}T00:00:00`)
    .lt('created_at', `${today}T23:59:59`)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function getScheduledToday(): Promise<ContentIdea[]> {
  const supabase = createAdminClient();
  const today = new Date().toISOString().split('T')[0];

  const { data, error } = await supabase
    .from('content_ideas')
    .select('*')
    .eq('status', 'scheduled')
    .gte('scheduled_for', `${today}T00:00:00`)
    .lt('scheduled_for', `${today}T23:59:59`)
    .order('scheduled_for', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function updateIdeaStatus(
  id: string,
  status: string,
  scheduled_for?: string
): Promise<void> {
  const supabase = createAdminClient();
  const update: Record<string, string | null> = { status };
  if (scheduled_for) update.scheduled_for = scheduled_for;

  const { error } = await supabase
    .from('content_ideas')
    .update(update)
    .eq('id', id);

  if (error) throw error;
}

export async function getIdeaById(id: string): Promise<ContentIdea | null> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('content_ideas')
    .select('*')
    .eq('id', id)
    .single();

  if (error) return null;
  return data;
}

export async function getAllScripts(): Promise<Script[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scripts')
    .select('*, content_ideas(hook, format, pillar)')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data || [];
}

export async function getScheduledPosts(): Promise<ScheduledPost[]> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('*, content_ideas(hook, format), scripts(title)')
    .order('scheduled_for', { ascending: true });

  if (error) throw error;
  return data || [];
}

export async function createScript(script: {
  idea_id: string;
  title: string;
  body: string;
  estimated_seconds?: number;
}): Promise<Script> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scripts')
    .insert(script)
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function createScheduledPost(post: {
  idea_id?: string;
  script_id?: string;
  platform?: string;
  scheduled_for?: string;
}): Promise<ScheduledPost> {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('scheduled_posts')
    .insert({ ...post, status: 'queued' })
    .select()
    .single();

  if (error) throw error;
  return data;
}

// ─── Financial Goals ───
export async function getFinancialGoals(month: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('financial_goals')
    .select('*')
    .eq('month', month)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function upsertFinancialGoal(goal: {
  id?: string;
  title: string;
  target: number;
  current: number;
  month: string;
  auto_sync?: boolean;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('financial_goals')
    .upsert(goal)
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteFinancialGoal(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('financial_goals').delete().eq('id', id);
  if (error) throw error;
}

// ─── Tasks ───
export async function getTasks() {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .is('completed_at', null)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function getCompletedTasks(limit = 20) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('tasks')
    .select('*')
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  return data || [];
}

export async function createTask(task: { text: string; quadrant: string; due?: string; recurring?: string }) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('tasks').insert(task).select().single();
  if (error) throw error;
  return data;
}

export async function updateTask(id: string, updates: Record<string, unknown>) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('tasks').update(updates).eq('id', id);
  if (error) throw error;
}

export async function deleteTask(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('tasks').delete().eq('id', id);
  if (error) throw error;
}

// ─── Objectives ───
export async function getObjectives(weekStart: string) {
  const supabase = createAdminClient();
  const { data, error } = await supabase
    .from('objectives')
    .select('*')
    .eq('week_start', weekStart)
    .order('created_at');
  if (error) throw error;
  return data || [];
}

export async function upsertObjective(obj: {
  id?: string;
  title: string;
  target: number;
  current: number;
  week_start: string;
}) {
  const supabase = createAdminClient();
  const { data, error } = await supabase.from('objectives').upsert(obj).select().single();
  if (error) throw error;
  return data;
}

export async function deleteObjective(id: string) {
  const supabase = createAdminClient();
  const { error } = await supabase.from('objectives').delete().eq('id', id);
  if (error) throw error;
}
