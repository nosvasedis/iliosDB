import { api } from '../../lib/supabase';

export const auditRepository = {
  logAction: (userName: string, action: string, details?: Record<string, unknown>) =>
    api.logAction(userName, action, details),
};
