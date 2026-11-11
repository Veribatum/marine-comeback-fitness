import { handleSchedule } from '@vercel/schedules';
import { sendDaily } from '../lib/reminders.js';

export const POST = handleSchedule(async metadata => {
  await sendDaily(metadata.scheduledAt);
});
