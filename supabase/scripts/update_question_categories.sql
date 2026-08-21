-- Migration: Update Interview Question Categories
-- Created: 2025-12-01
-- Description: Remove coding-related question categories and update to verbal-only categories

-- Update any existing questions with removed categories to 'other' FIRST
UPDATE public.interview_questions
SET question_category = 'other'
WHERE question_category IN ('technical_coding', 'technical_algorithms');

-- Drop the existing CHECK constraint
ALTER TABLE public.interview_questions
DROP CONSTRAINT IF EXISTS interview_questions_question_category_check;

-- Add the new CHECK constraint with updated categories
ALTER TABLE public.interview_questions
ADD CONSTRAINT interview_questions_question_category_check
CHECK (question_category IN (
  'behavioral_leadership',
  'behavioral_teamwork',
  'behavioral_conflict',
  'behavioral_failure',
  'technical_system_design',
  'technical_concepts',
  'company_culture',
  'company_values',
  'resume_specific',
  'other'
));
