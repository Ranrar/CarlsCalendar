export type DocumentType =
  | 'DAILY_SCHEDULE'
  | 'WEEKLY_SCHEDULE'
  | 'FIRST_THEN'
  | 'CHOICE_BOARD'
  | 'ROUTINE_STEPS'
  | 'EMOTION_CARDS'
  | 'AAC_BOARD'
  | 'REWARD_TRACKER';

export type PhaseADocumentType =
  | 'DAILY_SCHEDULE'
  | 'FIRST_THEN'
  | 'CHOICE_BOARD'
  | 'ROUTINE_STEPS';

export interface VisualCardItem {
  id: string;
  label: string;
  pictogramUrl?: string;
}

export interface PhaseALayoutSpec {
  type: PhaseADocumentType;
  title: string;
  slotCount: number;
  columns: number;
}
