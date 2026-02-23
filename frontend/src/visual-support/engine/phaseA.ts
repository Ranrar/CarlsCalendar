import type { PhaseADocumentType, PhaseALayoutSpec, VisualCardItem } from './types';

export const PHASE_A_LAYOUTS: Record<PhaseADocumentType, PhaseALayoutSpec> = {
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
