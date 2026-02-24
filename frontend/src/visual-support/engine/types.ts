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

export type PhaseBDocumentType =
  | 'WEEKLY_SCHEDULE'
  | 'EMOTION_CARDS'
  | 'REWARD_TRACKER';

export type SupportedVisualDocumentType = PhaseADocumentType | PhaseBDocumentType;

export interface VisualCardItem {
  id: string;
  label: string;
  pictogramUrl?: string;
}

export interface VisualLayoutSpec {
  type: SupportedVisualDocumentType;
  title: string;
  slotCount: number;
  columns: number;
}
