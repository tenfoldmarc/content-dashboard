export interface CompetitorPost {
  id: string;
  handle: string;
  content: string;
  likes: number;
  shares: number;
  views: number;
  post_url: string;
  scraped_at: string;
  thumbnail_url: string;
}

export interface ClientPost {
  id: string;
  ig_post_id: string | null;
  content: string;
  likes: number;
  shares: number;
  views: number;
  posted_at: string;
  is_outlier: boolean;
  thumbnail_url: string;
  permalink: string;
}

export interface ContentIdea {
  id: string;
  hook: string;
  format: string;
  pillar: string;
  relevance: string;
  status: 'pending' | 'approved' | 'scheduled' | 'skipped' | 'published';
  scheduled_for: string | null;
  created_at: string;
}

export interface Script {
  id: string;
  idea_id: string | null;
  title: string;
  body: string;
  estimated_seconds: number | null;
  created_at: string;
  content_ideas?: ContentIdea;
}

export interface ScheduledPost {
  id: string;
  idea_id: string | null;
  script_id: string | null;
  zernio_post_id: string | null;
  platform: string;
  status: 'queued' | 'scheduled' | 'published' | 'failed';
  scheduled_for: string | null;
  published_at: string | null;
  created_at: string;
  content_ideas?: ContentIdea;
  scripts?: Script;
}
