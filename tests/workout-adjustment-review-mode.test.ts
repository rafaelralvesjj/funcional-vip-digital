import test from 'node:test';
import assert from 'node:assert/strict';
import {
  resolveConversationPackageMode,
  buildDeepReviewOnlyResponseModel,
  buildDeepReviewOnlyPromptLines,
} from '../lib/workout-adjustment-review.ts';

test('deep review is allowed without eligible future workouts', () => {
  assert.equal(resolveConversationPackageMode('DEEP', 0), 'DEEP_REVIEW_ONLY');
});

test('standard adjustment remains blocked without eligible future workouts', () => {
  assert.equal(resolveConversationPackageMode('STANDARD', 0), 'BLOCKED_NO_ELIGIBLE');
});

test('existing eligible workouts keep the adjustment flow for both review depths', () => {
  assert.equal(resolveConversationPackageMode('STANDARD', 2), 'ADJUST_EXISTING');
  assert.equal(resolveConversationPackageMode('DEEP', 2), 'ADJUST_EXISTING');
});

test('review-only response model supports planning a new weekly program', () => {
  const model = buildDeepReviewOnlyResponseModel([
    { guidanceKey: 'MEDICAL_1', title: 'Orientação 1', summary: 'Resumo' },
  ]);

  assert.equal(model.reviewMode, 'REVIEW_ONLY');
  assert.deepEqual(model.workouts, []);
  assert.ok(model.programmingRecommendation);
  assert.deepEqual(model.programmingRecommendation.suggestedSessions, []);
  assert.deepEqual(model.guidanceCoverage, [
    { guidanceKey: 'MEDICAL_1', application: '', workoutIds: [] },
  ]);
});

test('review-only prompt explicitly asks for new programming without pretending there is a workout to edit', () => {
  const prompt = buildDeepReviewOnlyPromptLines().join('\n');
  assert.match(prompt, /não há treino futuro elegível/i);
  assert.match(prompt, /nova programação/i);
  assert.match(prompt, /não invente.*diagnóst/i);
});
