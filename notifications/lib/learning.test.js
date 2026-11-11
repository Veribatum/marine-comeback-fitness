import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize, PUT } from '../api/learning.js';

test('learning totals deduplicate lessons, missions, and Nova XP across devices', () => {
  assert.deepEqual(summarize([
    { source: 'mind', completed: ['lesson-a', 'lesson-b'] },
    { source: 'mind', completed: ['lesson-a'] },
    { source: 'nova', completed: ['mission-a'], rewards: [['mission-a:sim', 50]], legacyXP: 25 },
    { source: 'nova', completed: ['mission-a', 'mission-b'], rewards: [['mission-a:sim', 50], ['mission-b:vm', 80]], legacyXP: 25 }
  ]), { lessons: 2, missions: 2, mindXP: 20, novaXP: 155, mindConnected: true, novaConnected: true });
});

test('progress uploads require a private code and a matching source origin', async () => {
  const response = await PUT(new Request('https://example.com/api/learning', {
    method: 'PUT', headers: { Origin: 'https://veribatum.github.io', Authorization: 'Bearer ' + 'a'.repeat(64) },
    body: JSON.stringify({ source: 'mind', device: 'b'.repeat(64), completed: [], rewards: [], legacyXP: 0 })
  }));
  assert.equal(response.status, 400);
  const foreign = await PUT(new Request('https://example.com/api/learning', {
    method: 'PUT', headers: { Origin: 'https://example.org' }, body: '{}'
  }));
  assert.equal(foreign.status, 403);
});
