export interface Dhikr {
  id: number;
  name: string;
  total_count: number;
  daily_count: number;
  daily_limit: number | null;
  last_reset_date: string;
  sort_order: number;
  created_at: string;
}
