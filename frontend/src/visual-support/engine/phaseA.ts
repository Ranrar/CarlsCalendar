import type { SupportedVisualDocumentType, VisualLayoutSpec, VisualCardItem } from './types';

export const PHASE_A_LAYOUTS: Record<SupportedVisualDocumentType, VisualLayoutSpec> = {
  DAILY_SCHEDULE: {
    type: 'DAILY_SCHEDULE',
    title: 'Daily schedule',
    slotCount: 8,
    columns: 1,
  },
  FIRST_THEN: {
    type: 'FIRST_THEN',
    title: 'First / Then',
    slotCount: 2,
    columns: 2,
  },
  CHOICE_BOARD: {
    type: 'CHOICE_BOARD',
    title: 'Choice board',
    slotCount: 4,
    columns: 2,
  },
  ROUTINE_STEPS: {
    type: 'ROUTINE_STEPS',
    title: 'Routine steps',
    slotCount: 6,
    columns: 1,
  },
  WEEKLY_SCHEDULE: {
    type: 'WEEKLY_SCHEDULE',
    title: 'Weekly schedule',
    slotCount: 7,
    columns: 7,
  },
  EMOTION_CARDS: {
    type: 'EMOTION_CARDS',
    title: 'Emotion cards',
    slotCount: 6,
    columns: 3,
  },
  REWARD_TRACKER: {
    type: 'REWARD_TRACKER',
    title: 'Reward tracker',
    slotCount: 10,
    columns: 5,
  },
};

export const PHASE_A_SAMPLE_ITEMS: VisualCardItem[] = [
  { id: 'breakfast', label: 'Breakfast' },
  { id: 'brush_teeth', label: 'Brush teeth' },
  { id: 'dress', label: 'Get dressed' },
  { id: 'school', label: 'School' },
  { id: 'snack', label: 'Snack' },
  { id: 'play', label: 'Play' },
  { id: 'homework', label: 'Homework' },
  { id: 'bath', label: 'Bath' },
  { id: 'bedtime', label: 'Bedtime' },
];

export function firstEmptyIndex<T>(arr: Array<T | null>): number {
  const idx = arr.findIndex((x) => x === null);
  return idx >= 0 ? idx : arr.length - 1;
}
