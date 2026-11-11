import { handleSchedule } from '@vercel/schedules';
import { sendDaily } from '../lib/reminders.js';

export const POST = handleSchedule(async metadata => {
  const kind = metadata.name === 'marine-evening-reminder' ? 'evening' : 'gym';
  await sendDaily(metadata.scheduledAt, undefined, undefined, kind);
});
