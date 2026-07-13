export interface Exception {
  status: number;
  error: string;
  message: string | string[];
  code?: string;
  path: string;
  timestamp: string;
  details?: unknown;
}
